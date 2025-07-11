/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Command } from 'commander';
import { 
  TrustSchemaEnforcement, 
  TrustNodeLlamaClient,
  type JSONSchema, 
  type StructuredRequest, 
  type OutputFormat 
} from '@trust-cli/trust-cli-core';
import chalk from 'chalk';

/**
 * Add structured output commands to CLI
 */
export function addStructuredCommands(program: Command): void {
  const structuredCmd = program
    .command('structured')
    .description('Generate structured output in JSON, XML, or KV format');

  structuredCmd
    .command('generate')
    .description('Generate structured data from a prompt with schema validation')
    .option('-f, --format <format>', 'Output format: json, xml, or kv', 'json')
    .option('-s, --schema <schema>', 'JSON schema file or inline schema')
    .option('-p, --prompt <prompt>', 'Generation prompt')
    .option('-r, --retries <number>', 'Maximum retry attempts', '3')
    .option('--strict', 'Enable strict validation', false)
    .option('-o, --output <file>', 'Output file path')
    .action(async (options) => {
      try {
        await handleStructuredGenerate(options);
      } catch (error) {
        console.error(chalk.red('Error generating structured output:'), error);
        process.exit(1);
      }
    });

  structuredCmd
    .command('validate')
    .description('Validate data against a JSON schema')
    .option('-f, --format <format>', 'Input format: json, xml, or kv', 'json')
    .option('-s, --schema <schema>', 'JSON schema file or inline schema')
    .option('-d, --data <data>', 'Data to validate (file path or inline)')
    .action(async (options) => {
      try {
        await handleStructuredValidate(options);
      } catch (error) {
        console.error(chalk.red('Error validating data:'), error);
        process.exit(1);
      }
    });

  structuredCmd
    .command('convert')
    .description('Convert between JSON, XML, and KV formats')
    .option('-f, --from <format>', 'Source format: json, xml, or kv', 'json')
    .option('-t, --to <format>', 'Target format: json, xml, or kv', 'xml')
    .option('-d, --data <data>', 'Data to convert (file path or inline)')
    .option('-o, --output <file>', 'Output file path')
    .action(async (options) => {
      try {
        await handleStructuredConvert(options);
      } catch (error) {
        console.error(chalk.red('Error converting data:'), error);
        process.exit(1);
      }
    });
}

/**
 * Handle structured generation command
 */
async function handleStructuredGenerate(options: {
  format: string;
  schema: string;
  prompt: string;
  retries: string;
  strict: boolean;
  output?: string;
}): Promise<void> {
  const { format, schema, prompt, retries, strict, output } = options;

  if (!prompt) {
    throw new Error('Prompt is required. Use -p or --prompt option.');
  }

  if (!schema) {
    throw new Error('Schema is required. Use -s or --schema option.');
  }

  // Validate format
  const validFormats: OutputFormat[] = ['json', 'xml', 'kv'];
  if (!validFormats.includes(format)) {
    throw new Error(`Invalid format: ${format}. Must be one of: ${validFormats.join(', ')}`);
  }

  // Parse schema
  let parsedSchema: JSONSchema;
  try {
    // Try to parse as JSON first
    parsedSchema = JSON.parse(schema);
  } catch {
    // If not JSON, try to read as file
    const fs = await import('fs/promises');
    try {
      const schemaContent = await fs.readFile(schema, 'utf-8');
      parsedSchema = JSON.parse(schemaContent);
    } catch {
      throw new Error(`Invalid schema: ${schema}. Must be valid JSON or a file path.`);
    }
  }

  console.log(chalk.blue('🔧 Initializing structured output generation...'));
  console.log(chalk.gray(`Format: ${format}`));
  console.log(chalk.gray(`Prompt: ${prompt}`));
  console.log(chalk.gray(`Max retries: ${retries}`));

  // Initialize schema enforcement
  const client = new TrustNodeLlamaClient();
  const schemaEnforcement = new TrustSchemaEnforcement(client);

  const request: StructuredRequest = {
    prompt,
    schema: parsedSchema,
    format: format as OutputFormat,
    maxRetries: parseInt(retries, 10),
    validationStrict: strict,
  };

  console.log(chalk.blue('🚀 Generating structured output...'));
  
  const result = await schemaEnforcement.generateStructured(request);

  if (result.valid) {
    console.log(chalk.green('✅ Successfully generated structured output!'));
    
    if (output) {
      const fs = await import('fs/promises');
      await fs.writeFile(output, result.rawResponse || '', 'utf-8');
      console.log(chalk.green(`📁 Output saved to: ${output}`));
    } else {
      console.log(chalk.cyan('\n📋 Generated Output:'));
      console.log(result.rawResponse);
    }

    if (result.data) {
      console.log(chalk.cyan('\n📊 Validated Data:'));
      console.log(JSON.stringify(result.data, null, 2));
    }
  } else {
    console.log(chalk.red('❌ Generation failed:'));
    result.errors?.forEach((error: string) => {
      console.log(chalk.red(`  • ${error}`));
    });
    
    if (result.rawResponse) {
      console.log(chalk.yellow('\n📋 Raw Response:'));
      console.log(result.rawResponse);
    }
    
    process.exit(1);
  }
}

/**
 * Handle structured validation command
 */
async function handleStructuredValidate(options: {
  format: string;
  schema: string;
  data: string;
}): Promise<void> {
  const { format, schema, data } = options;

  if (!schema) {
    throw new Error('Schema is required. Use -s or --schema option.');
  }

  if (!data) {
    throw new Error('Data is required. Use -d or --data option.');
  }

  // Parse schema
  let parsedSchema: JSONSchema;
  try {
    parsedSchema = JSON.parse(schema);
  } catch {
    const fs = await import('fs/promises');
    try {
      const schemaContent = await fs.readFile(schema, 'utf-8');
      parsedSchema = JSON.parse(schemaContent);
    } catch {
      throw new Error(`Invalid schema: ${schema}. Must be valid JSON or a file path.`);
    }
  }

  // Parse data
  let dataContent: string;
  try {
    // Try as inline data first
    if (data.startsWith('{') || data.startsWith('<') || data.includes('=')) {
      dataContent = data;
    } else {
      // Try as file path
      const fs = await import('fs/promises');
      dataContent = await fs.readFile(data, 'utf-8');
    }
  } catch {
    throw new Error(`Could not read data: ${data}`);
  }

  console.log(chalk.blue('🔧 Validating data against schema...'));

  // Initialize schema enforcement
  const client = new TrustNodeLlamaClient();
  const schemaEnforcement = new TrustSchemaEnforcement(client);

  const result = schemaEnforcement.validateAndExtract(dataContent, parsedSchema, true, format as OutputFormat);

  if (result.valid) {
    console.log(chalk.green('✅ Data is valid!'));
    
    if (result.data) {
      console.log(chalk.cyan('\n📊 Parsed Data:'));
      console.log(JSON.stringify(result.data, null, 2));
    }
  } else {
    console.log(chalk.red('❌ Validation failed:'));
    result.errors?.forEach((error: string) => {
      console.log(chalk.red(`  • ${error}`));
    });
    process.exit(1);
  }
}

/**
 * Handle structured conversion command
 */
async function handleStructuredConvert(options: {
  from: string;
  to: string;
  data: string;
  output?: string;
}): Promise<void> {
  const { from, to, data, output } = options;

  if (!data) {
    throw new Error('Data is required. Use -d or --data option.');
  }

  const validFormats: OutputFormat[] = ['json', 'xml', 'kv'];
  if (!validFormats.includes(from)) {
    throw new Error(`Invalid source format: ${from}. Must be one of: ${validFormats.join(', ')}`);
  }
  if (!validFormats.includes(to)) {
    throw new Error(`Invalid target format: ${to}. Must be one of: ${validFormats.join(', ')}`);
  }

  // Parse data
  let dataContent: string;
  try {
    if (data.startsWith('{') || data.startsWith('<') || data.includes('=')) {
      dataContent = data;
    } else {
      const fs = await import('fs/promises');
      dataContent = await fs.readFile(data, 'utf-8');
    }
  } catch {
    throw new Error(`Could not read data: ${data}`);
  }

  console.log(chalk.blue(`🔄 Converting from ${from} to ${to}...`));

  // Initialize schema enforcement
  const client = new TrustNodeLlamaClient();
  const schemaEnforcement = new TrustSchemaEnforcement(client);

  // Create a permissive schema for conversion
  const permissiveSchema: JSONSchema = {
    type: 'object',
    description: 'Permissive schema for data conversion'
  };

  // Parse the source data
  const parseResult = schemaEnforcement.validateAndExtract(dataContent, permissiveSchema, false, from as OutputFormat);

  if (!parseResult.valid || !parseResult.data) {
    console.log(chalk.red('❌ Failed to parse source data:'));
    parseResult.errors?.forEach((error: string) => {
      console.log(chalk.red(`  • ${error}`));
    });
    process.exit(1);
  }

  // Convert to target format
  let convertedData: string;
  if (to === 'json') {
    convertedData = JSON.stringify(parseResult.data, null, 2);
  } else if (to === 'xml') {
    // Access private method for conversion (this is a utility function)
    convertedData = (schemaEnforcement as any).convertJSONToXML(parseResult.data);
  } else if (to === 'kv') {
    // Access private method for conversion
    convertedData = (schemaEnforcement as any).convertJSONToKV(parseResult.data);
  } else {
    throw new Error(`Unsupported target format: ${to}`);
  }

  console.log(chalk.green('✅ Conversion successful!'));

  if (output) {
    const fs = await import('fs/promises');
    await fs.writeFile(output, convertedData, 'utf-8');
    console.log(chalk.green(`📁 Output saved to: ${output}`));
  } else {
    console.log(chalk.cyan('\n📋 Converted Output:'));
    console.log(convertedData);
  }
}