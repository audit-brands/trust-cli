# Web Search Tool (`google_web_search`)

This document describes the `google_web_search` tool.

## Description

Use `google_web_search` to perform a web search using Google Search via the Gemini API. The `google_web_search` tool returns a summary of web results with sources.

**Important:** This tool should only be used for finding current information, facts, news, documentation, or data that requires internet research. It should NOT be used for basic arithmetic, simple logic questions, or general knowledge that can be answered without external information.

### Arguments

`google_web_search` takes one argument:

- `query` (string, required): The search query.

## How to use `google_web_search` with the Gemini CLI

The `google_web_search` tool sends a query to the Gemini API, which then performs a web search. `google_web_search` will return a generated response based on the search results, including citations and sources.

Usage:

```
google_web_search(query="Your query goes here.")
```

## `google_web_search` examples

Get information on a topic:

```
google_web_search(query="latest advancements in AI-powered code generation")
```

## Important notes

- **Response returned:** The `google_web_search` tool returns a processed summary, not a raw list of search results.
- **Citations:** The response includes citations to the sources used to generate the summary.
- **Automatic filtering:** The tool will reject queries for basic arithmetic (e.g., "2+2", "what is 10*5") and simple number properties (e.g., "is 17 prime", "is 4 even") to prevent unnecessary web searches for calculable results.
- **Use appropriately:** Only use this tool when you need current information from the web, not for calculations or logic that can be solved directly.
