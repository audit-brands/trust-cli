/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Command } from 'commander';
import { 
  TrustSchemaEnforcement, 
  TrustNodeLlamaClient,
  LogitBiasManager,
  type JSONSchema, 
  type StructuredRequest, 
  type OutputFormat,
  type LogitBiasConfig 
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
    .option('-b, --bias <level>', 'Logit bias level for JSON: light, moderate, aggressive', 'moderate')
    .option('--bias-config <config>', 'Custom logit bias configuration (JSON file or inline)')
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

  structuredCmd
    .command('bias')
    .description('Configure logit bias for JSON token generation')
    .option('-l, --level <level>', 'Bias preset level: light, moderate, aggressive', 'moderate')
    .option('-c, --config <config>', 'Custom bias configuration (JSON file or inline)')
    .option('-t, --test <prompt>', 'Test bias configuration with a prompt')
    .option('-s, --schema <schema>', 'JSON schema for testing (required with --test)')
    .option('-o, --output <file>', 'Save bias configuration to file')
    .option('--show-presets', 'Show available bias presets')
    .action(async (options) => {
      try {
        await handleLogitBias(options);
      } catch (error) {
        console.error(chalk.red('Error configuring logit bias:'), error);
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
  bias?: string;
  biasConfig?: string;
}): Promise<void> {
  const { format, schema, prompt, retries, strict, output, bias, biasConfig } = options;

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

  // Prepare logit bias configuration
  let logitBiasConfig: LogitBiasConfig | undefined;
  
  if (biasConfig) {
    // Parse custom bias configuration
    try {
      logitBiasConfig = JSON.parse(biasConfig);
    } catch {
      // Try to read as file
      const fs = await import('fs/promises');
      try {
        const configContent = await fs.readFile(biasConfig, 'utf-8');
        logitBiasConfig = JSON.parse(configContent);
      } catch {
        throw new Error(`Invalid bias configuration: ${biasConfig}. Must be valid JSON or a file path.`);
      }
    }
  } else if (format === 'json' && bias) {
    // Use preset bias level for JSON format
    logitBiasConfig = LogitBiasManager.createJsonPreset(bias as 'light' | 'moderate' | 'aggressive');
  }

  const request: StructuredRequest = {
    prompt,
    schema: parsedSchema,
    format: format as OutputFormat,
    maxRetries: parseInt(retries, 10),
    validationStrict: strict,
    options: logitBiasConfig ? { logitBias: logitBiasConfig } : undefined,
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

/**
 * Handle logit bias configuration command
 */
async function handleLogitBias(options: {
  level?: string;
  config?: string;
  test?: string;
  schema?: string;
  output?: string;
  showPresets?: boolean;
}): Promise<void> {
  const { level, config, test, schema, output, showPresets } = options;

  if (showPresets) {
    console.log(chalk.blue('📋 Available Logit Bias Presets:'));
    console.log();
    
    const presets = ['light', 'moderate', 'aggressive'] as const;
    for (const preset of presets) {
      const presetConfig = LogitBiasManager.createJsonPreset(preset);
      console.log(chalk.green(`${preset.toUpperCase()}:`));
      console.log(`  - Structural token boost: ${presetConfig.jsonBias?.boostStructural ? 'enabled' : 'disabled'}`);
      console.log(`  - Invalid token suppression: ${presetConfig.jsonBias?.suppressInvalid ? 'enabled' : 'disabled'}`);
      console.log(`  - Contextual biases: ${presetConfig.contextualBias ? 'enabled' : 'disabled'}`);
      console.log(`  - Value biases: ${Object.keys(presetConfig.jsonBias?.valueBias || {}).length} configured`);
      console.log();
    }
    return;
  }

  let biasConfig: LogitBiasConfig;

  if (config) {
    // Parse custom configuration
    try {
      biasConfig = JSON.parse(config);
    } catch {
      // Try to read as file
      const fs = await import('fs/promises');
      try {
        const configContent = await fs.readFile(config, 'utf-8');
        biasConfig = JSON.parse(configContent);
      } catch {
        throw new Error(`Invalid bias configuration: ${config}. Must be valid JSON or a file path.`);
      }
    }
  } else {
    // Use preset level
    const presetLevel = (level || 'moderate') as 'light' | 'moderate' | 'aggressive';
    biasConfig = LogitBiasManager.createJsonPreset(presetLevel);
  }

  console.log(chalk.blue('⚙️ Logit Bias Configuration:'));
  console.log(JSON.stringify(biasConfig, null, 2));

  if (output) {
    const fs = await import('fs/promises');
    await fs.writeFile(output, JSON.stringify(biasConfig, null, 2), 'utf-8');
    console.log(chalk.green(`📁 Configuration saved to: ${output}`));
  }

  if (test && schema) {
    console.log(chalk.blue('\n🧪 Testing bias configuration...'));
    
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

    // Initialize schema enforcement and test
    const client = new TrustNodeLlamaClient();
    const schemaEnforcement = new TrustSchemaEnforcement(client);

    const request: StructuredRequest = {
      prompt: test,
      schema: parsedSchema,
      format: 'json',
      maxRetries: 1,
      validationStrict: true,
      options: { logitBias: biasConfig },
    };

    console.log(chalk.gray(`Test prompt: ${test}`));
    console.log(chalk.blue('🚀 Generating test output...'));
    
    const result = await schemaEnforcement.generateStructured(request);

    if (result.valid) {
      console.log(chalk.green('✅ Test generation successful!'));
      console.log(chalk.cyan('\n📋 Generated Output:'));
      console.log(result.rawResponse);
      
      if (result.data) {
        console.log(chalk.cyan('\n📊 Parsed Data:'));
        console.log(JSON.stringify(result.data, null, 2));
      }
    } else {
      console.log(chalk.red('❌ Test generation failed:'));
      result.errors?.forEach((error: string) => {
        console.log(chalk.red(`  • ${error}`));
      });
      
      if (result.rawResponse) {
        console.log(chalk.yellow('\n📋 Raw Response:'));
        console.log(result.rawResponse);
      }
    }
  } else if (test) {
    console.log(chalk.yellow('⚠️ Schema is required for testing. Use -s or --schema option.'));
  }
}