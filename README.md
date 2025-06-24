# Genkit with GraphQL tools

This project demonstrates how to call LLM from [Genkit](https://genkit.dev/) framework and pass it the tool (for [fuction calling](https://ai.google.dev/gemini-api/docs/function-calling?example=meeting)). This tool is created to run the produced GraphQL query against the GraphQL server configured in accompanying .env file.


## Installation
1. Install node and npm
```bash
npm i 
```
2. Another project - DataHub - that is GraphQL server is required. Build and run it from its repository. Then it supposed to be deployed at Azure Web App. See the corresponding instructions in README file of that project.
The URL of the GraphQL server (locall or deployed) should be referred n the .env file.
3. Create your Google API Key if you plan to use Gemini as LLM. (for personal API key see https://1drv.ms/t/c/AAB8403F89EC60E6/ATDD6--MZIdJlMeRH10PEt0?e=3Qu5nz , "./Dev/GenkitGraphQL/.env") 
3. create .env with the following structure
```text
GRAPHQL_URL = <see below>
PORT=3401
CLIENT_ID = "993f503d-8081-4a84-b5b5-30b3e7f3c641"
TOKEN_VALIDATION_URL = "https://api.tel-aviv.gov.il/sso/validate_token"
GOOGLE_API_KEY=<see below>
```

## Usage
Standalone process:
```bash 
nmp run dev
```
With GenKit Dev UI:
```
npm run devui
```

## Notes
This project uses [Dotprompts](https://genkit.dev/docs/dotprompt/) with Genkit. 
The intention is to try the various prompts with Genkit Dev UI and then use refined one in the template located in ./llm_prompts directory.

