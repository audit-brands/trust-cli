# Architecture: Unified Model Management Layer

**Version:** 1.0
**Status:** Proposed

---

## 1. The Problem: A Fragmented User Experience

The current `trust-cli` has two parallel and separate systems for managing local AI models:

1.  **The Native Trust System:** Manages GGUF models downloaded via `trust model download` into the `~/.trustcli/models/` directory. The `trust model` subcommands (`list`, `delete`, etc.) only operate on this system.
2.  **The Ollama System:** Manages models pulled via `ollama pull` into the `~/.ollama/models` directory. These models are managed via the `ollama` command itself.

This creates a confusing and fragmented user experience. A user must learn and use two different sets of commands to manage their local models, and they have no single view of all the AI assets available on their machine.

## 2. The Vision: A Universal Interface

To solve this, we will architect a **unified model management layer**. The `trust model` command will be elevated from a simple GGUF manager into a **universal interface for all local models**, regardless of their underlying backend (HuggingFace GGUF or Ollama).

The `trust-cli` will become the single pane of glass for managing a user's entire local AI environment, abstracting away the technical details of where and how models are stored.

## 3. Technical Requirements & UX Specifications

### 3.1. `trust model list`

- **Requirement:** This command must display a single, consolidated list of all models available from both the native `~/.trustcli/models/` directory and the Ollama REST API (`ollama list`).
- **Implementation Details:**
  - The command will first query the Ollama API.
  - It will then read the contents of its own `models.json` file.
  - It will merge these two lists into a single data structure.
- **UX Specification:**
  - The output table must include a new `Backend` column to clearly indicate the source of each model (`HuggingFace` or `Ollama`).
  - The command should intelligently handle duplicates (e.g., if the same model exists in both backends, it could be shown once with both backends listed).

### 3.2. `trust model delete <model_name>`

- **Requirement:** This command must be able to delete any model from the consolidated list, regardless of its backend.
- **Implementation Details:**
  - When the command is run, it will first determine which backend the specified `<model_name>` belongs to.
  - If it is a `HuggingFace` model, it will execute the existing logic to remove the GGUF file and update `models.json`.
  - If it is an `Ollama` model, it will execute the `ollama rm <model_name>` command as a child process.
- **UX Specification:**
  - The user experience should be seamless. The user should not need to know or care which backend the model belongs to. The command should simply confirm that "Model <model_name> has been deleted."

### 3.3. `trust model download <model_name>`

- **Requirement:** This command should be the single entry point for acquiring new local models.
- **Implementation Details:**
  - The CLI will need to maintain a master list or a heuristic to determine the primary source for a given model.
  - When a user requests a model, the CLI will check its primary source. If the model is known to be an Ollama model, the CLI will execute `ollama pull <model_name>` under the hood.
  - If it is a GGUF model, it will use the existing download logic.
- **UX Specification:**
  - The command should provide consistent progress and completion feedback, regardless of which backend is being used to download the model.
  - If a model is available from multiple sources, the CLI could prompt the user to choose their preferred source.

## 4. Benefits

- **Simplicity:** The user only needs to learn one set of commands: `trust model ...`.
- **Clarity:** A single `trust model list` command provides a complete picture of all local AI assets.
- **Power:** It abstracts away the underlying technical details, allowing the user to think about their _models_, not their _backends_.
