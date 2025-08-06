# Deep Research API (NestJS)

A robust and efficient API for conducting structured deep research tasks, built using NestJS. This project utilizes advanced reasoning models from OpenAI to intelligently decompose queries, extract content, and produce detailed research outputs.

## Key Features

* **Advanced Query Decomposition**
  Intelligent breakdown of complex research queries into structured sub-queries for comprehensive analysis.

* **OpenAI Reasoning Models Integration**
  Leverages powerful OpenAI models specialized in reasoning tasks, ensuring precise and reliable results.

* **Content Crawling & Extraction**
  Incorporates Firecrawl to retrieve and analyze data from web content, generating structured outputs seamlessly.

* **Structured Prompting Techniques**
  Employs sophisticated prompting strategies to significantly enhance response accuracy and relevance.

* **Parameter Estimation Based on User Input**
  Begins research by receiving an initial query, then prompts the user with 1-3 follow-up questions. These responses, along with the original query, are analyzed to automatically estimate appropriate research parameters.

* **RESTful API with NestJS**
  Built using NestJS to provide a scalable, maintainable, and developer-friendly backend.

## Tech Stack

| Component              | Technologies Used                  |
| ---------------------- | ---------------------------------- |
| **Backend Framework**  | NestJS, TypeScript                 |
| **AI & Reasoning**     | OpenAI Reasoning Models            |
| **Database & ORM**     | Prisma, PostgreSQL (Neon Database) |
| **Content Extraction** | Firecrawl                          |




