import dotenv from 'dotenv';
dotenv.config();
import { genkit } from 'genkit';
import * as fsPromises from 'fs/promises';
import { ApolloClient, gql, HttpLink, InMemoryCache } from "@apollo/client/core/index.js"; // Import directly from core
import { googleAI, gemini25FlashPreview0417} from '@genkit-ai/googleai';

import express from 'express';

import { z } from 'zod';
import { jwtDecode } from "jwt-decode";
import { buildSchema, parse, validate, GraphQLError } from 'graphql'; // Import GraphQL validation tools

const _googleAI = googleAI({ apiKey: process.env.GOOGLE_API_KEY });
const ai = genkit({
    plugins: [_googleAI],
    promptDir: './llm_prompts', // scan this directory and register any .prompt files found.
    model: gemini25FlashPreview0417,
    enableTracingAndMetrics: false
});

const graphql_endpoint = process.env.GRAPHQL_URL;

const httpLink = new HttpLink({ 
    uri: graphql_endpoint, 
});
const apolloClient = new ApolloClient({
    link: httpLink,
    cache: new InMemoryCache(),
});

export const executeGraphQL = ai.defineTool({
        name: "executedGraphQL",
        description: "Executes a GraphQL query to retrieve user data. Use this tool to answer any user question about their data.",
        inputSchema: z.object({
            query: z.string(),
        }),
        outputSchema: z.array(
            z.object({
                name: z.string(),
                description: z.string().nullable().optional(),
                link: z.string().url().nullable().optional()
            })
        )
    },
    async ({query}, { context }) => {

        try {

            if(query) {

                let parsedQuery;
                try {
                  parsedQuery = parse(query); 
                } catch (syntaxError) {
                    console.warn({ err: syntaxError, query: query }, 'LLM-generated GraphQL query has syntax errors.');
                    throw new Error(`GraphQL query syntax error: ${syntaxError.message}`);
                }

                const gqlQuery = gql`${query}`;
                const graphql_result = await apolloClient.query({
                    query: gqlQuery,
                    context: {
                        headers: {
                            authorization: `Bearer ${context.access_token}`,
                            "x-user-location": context?.headers["x-user-location"]
                        }
                    }                    
                });
                if (!graphql_result.data || !graphql_result.data.me) {
                    console.warn({ query: query }, "Query did not return a 'me' object.");
                    return [];
                }

                const me = graphql_result.data.me;

                // Find the first key on the 'me' object that isn't '__typename'.
                // This assumes the LLM generates a query with one main data field under 'me'.
                const dataKey = Object.keys(me).find(key => key !== '__typename');
                const resultData = me[dataKey];
                let items = [];

                // Check if the result is a GraphQL Connection (has 'edges').
                if (resultData && Array.isArray(resultData.edges)) {
                    items = resultData.edges.map(edge => edge.node).filter(node => node !== null); // Filter out null nodes
                }
                // Check if the result is a simple array.
                else if (Array.isArray(resultData)) {
                    items = resultData.filter(item => item !== null); // Filter out null items
                }

                // Now, map the extracted items to the desired output format.
                // This is more flexible and won't crash if a field is missing.
                return items.map(item => ({
                    // The LLM should be prompted to return a 'name' or 'title' field.
                    // We can look for common variations.
                    name: String(item.name || item.title || item.ticketNumber || item.accountNumber || 'N/A'),
                    description: item.description ? String(item.description) : null,
                    link: item.link ? String(item.link) : null,
                }));

            }

            return [];

        } catch(error) {
            console.error(
                { err: error, query: input.query },
                'GraphQL query execution failed.'
            );

            return [];
        }     
    }  
);

export const toolsFlow = ai.defineFlow(
    {
        name: "ToolsFlow",
        inputSchema: z.string(),
        // outputSchema: z.array(z.object({ // Expected output from the GraphQL tool
        //     name: z.string(),
        //     description: z.string().nullable().optional(),
        //     link: z.string().url().nullable().optional()
        // })),
        outputSchema: z.string(), // The final, user-facing text response from the LLM.
    },
    async (flowInput, {context}) => {

        const validationRequestBody = {
            clientId: process.env.CLIENT_ID
        }

        const token_validation_url = process.env.TOKEN_VALIDATION_URL;
        const validation_resp = await fetch(token_validation_url, {
            method: 'POST',
            body: JSON.stringify(validationRequestBody),
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + context.access_token 
            }
        })
        if( !validation_resp.ok ) {
            const errorJson = await validation_resp.json()
            const errorMessage = errorJson.developerMessage;
            throw new Error(errorMessage);
        }

        const schemaSDL = await fsPromises.readFile('./llm_prompts/schema.graphql', 'utf-8');

        try {
            const graphQL_agent_prompt = ai.prompt('graphql_agent'); // '.prompt' extension will be added automatically
            const renderedPromptOptions = await graphQL_agent_prompt.render(
                {
                    schemaSDL: schemaSDL,
                    userInput: flowInput
                }
            )

            const generateOptions = {
                ...renderedPromptOptions,
                tools: [executeGraphQL],
            }
            const llmResponse = await ai.generate(generateOptions);
            // When using automatic tool execution, ai.generate() handles the entire
            // loop of calling tools and feeding results back to the model.
            // The final llmResponse.text contains the model's natural language answer.
            return llmResponse.text;
        }
        catch(error) {
            console.error(
                { err: error }, 
                'Flow failed during LLM generation or tool execution.'
            );
            // Re-throw the error so it can be caught by the Express handler and a proper HTTP response can be sent.
            throw error;
        }

    }
);

const port = process.env.PORT ? Number(process.env.PORT) : undefined;

const app = express();
app.use(express.json());

app.post('/toolsFlow', async(req, res) => {
    try {
        const headers = req.headers;

        const access_token = headers?.authorization?.split(' ')[1];
        const decoded = jwtDecode(access_token);
        const userId = decoded["signInNames.citizenId"];
        const result = await toolsFlow(req.body.data, {
                                    context: { 
                                        headers,
                                        access_token,
                                        userId
                                    } 
                                }
                        );
        res.json(result);
    } catch(error) {
        console.error(
            { err: error, path: req.path, body: req.body },
            'Error in /toolsFlow endpoint'
        );
        res.status(500).json({ error: error.message || 'An unexpected error occurred.' });
    }


})

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

// startFlowServer({
//     flows: [toolsFlow],
//     port: port,
// });