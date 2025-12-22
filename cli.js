#!/usr/bin/env node

import fs from 'fs';
import jsyaml from 'js-yaml';
import { generateMatrix, extractMatrices } from './src/lib/matrix.js';

const args = process.argv.slice(2);

function printUsage() {
    console.log(`Usage: github-matrix-parser [options] <file>

Options:
  --output=yaml|json    Output format (default: yaml)
  --check               Validate only (no output unless error)
  --allow-underspecified Don't fail if jobs are underspecified (only with --check)
  --help                Show this help message
`);
}

if (args.includes('--help')) {
    printUsage();
    process.exit(0);
}

// Parse arguments
let filePath = null;
let outputFormat = 'yaml';
let checkMode = false;
let allowUnderspecified = false;

for (const arg of args) {
    if (arg.startsWith('--output=')) {
        outputFormat = arg.split('=')[1];
        if (!['yaml', 'json'].includes(outputFormat)) {
            console.error(`Error: Invalid output format '${outputFormat}'. Must be 'yaml' or 'json'.`);
            process.exit(1);
        }
    } else if (arg === '--check') {
        checkMode = true;
    } else if (arg === '--allow-underspecified') {
        allowUnderspecified = true;
    } else if (!arg.startsWith('-')) {
        filePath = arg;
    } else {
        console.error(`Error: Unknown argument '${arg}'`);
        printUsage();
        process.exit(1);
    }
}

if (!filePath) {
    console.error('Error: No input file specified.');
    printUsage();
    process.exit(1);
}

// Read input
let inputContent;
try {
    inputContent = fs.readFileSync(filePath, 'utf8');
} catch (e) {
    console.error(`Error reading file: ${e.message}`);
    process.exit(1);
}

// Parse YAML
let parsedInput;
try {
    parsedInput = jsyaml.load(inputContent);
} catch (e) {
    console.error(`Error parsing YAML: ${e.message}`);
    process.exit(1);
}

if (!parsedInput || typeof parsedInput !== 'object') {
    console.error('Error: Invalid input format.');
    process.exit(1);
}

// Extract and Generate
let jobResults = [];
try {
    const matrixDefs = extractMatrices(parsedInput);
    if (matrixDefs.length === 0) {
        console.error('Error: No matrix definitions found in input.');
        process.exit(1);
    }

    jobResults = matrixDefs.map(def => ({
        name: def.name,
        combinations: generateMatrix(def.matrix)
    }));
} catch (e) {
    console.error(`Error generating matrix: ${e.message}`);
    process.exit(1);
}

// Check for underspecified jobs
let hasUnderspecified = false;
const errors = [];

for (const job of jobResults) {
    const allKeys = new Set();
    job.combinations.forEach(combo => {
        Object.keys(combo).forEach(k => allKeys.add(k));
    });

    let jobUnderspecifiedCount = 0;
    for (const combo of job.combinations) {
        if (Object.keys(combo).length < allKeys.size) {
            jobUnderspecifiedCount++;
        }
    }

    if (jobUnderspecifiedCount > 0) {
        hasUnderspecified = true;
        if (checkMode && !allowUnderspecified) {
            errors.push(`Error: Job '${job.name}' has ${jobUnderspecifiedCount} underspecified combinations.`);
        }
    }
}

if (checkMode) {
    if (errors.length > 0) {
        errors.forEach(e => console.error(e));
        process.exit(1);
    }
    
    if (hasUnderspecified && !allowUnderspecified) {
        process.exit(1); // Should be handled above, but safety check
    }
    console.log('Matrix definition is valid.');
    process.exit(0);
}

// Output
if (outputFormat === 'json') {
    // If single result and name is generic 'Job' (extracted from raw matrix),
    // output the array directly for backward compatibility and simplicity.
    if (jobResults.length === 1 && jobResults[0].name === 'Job') {
        const outputObj = { 'Job': jobResults[0].combinations };
        console.log(JSON.stringify(outputObj, null, 2));
    } else {
        const outputObj = {};
        jobResults.forEach(j => { outputObj[j.name] = j.combinations; });
        console.log(JSON.stringify(outputObj, null, 2));
    }
} else {
    // YAML output
    // If multiple jobs, output a dictionary keyed by job name.
    // If single job with generic name 'Job', output the list directly.
    if (jobResults.length === 1 && jobResults[0].name === 'Job') {
        console.log(jsyaml.dump(jobResults[0].combinations));
    } else {
        const outputObj = {};
        jobResults.forEach(j => { outputObj[j.name] = j.combinations; });
        console.log(jsyaml.dump(outputObj));
    }
}
