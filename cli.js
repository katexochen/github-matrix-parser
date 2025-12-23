#!/usr/bin/env node

import fs from 'fs';
import jsyaml from 'js-yaml';
import { generateMatrix, extractMatrices } from './src/lib/matrix.js';

const args = process.argv.slice(2);

function printUsage() {
    console.log(`Usage: github-matrix-parser [options] <file>...

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

const filePaths = [];
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
        filePaths.push(arg);
    } else {
        console.error(`Error: Unknown argument '${arg}'`);
        printUsage();
        process.exit(1);
    }
}

if (filePaths.length === 0) {
    console.error('Error: No input file specified.');
    printUsage();
    process.exit(1);
}

function findLineNumber(content, jobName) {
    const lines = content.split('\n');
    if (jobName === 'Job') {
        // Try to find 'matrix:' key, assuming it's a matrix definition inside strategy or top level
        for (let i = 0; i < lines.length; i++) {
             if (lines[i].includes('matrix:')) return i + 1;
        }
        return 1;
    }
    
    // Search for "jobName:" or "  jobName:"
    const escapedName = jobName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`^\\s*${escapedName}:`);
    for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) return i + 1;
    }
    return 1;
}

let exitCode = 0;
const allResults = {};

for (const filePath of filePaths) {
    let inputContent;
    try {
        inputContent = fs.readFileSync(filePath, 'utf8');
    } catch (e) {
        console.error(`Error reading file ${filePath}: ${e.message}`);
        exitCode = 1;
        continue;
    }

    let parsedInput;
    try {
        parsedInput = jsyaml.load(inputContent);
    } catch (e) {
        console.error(`Error parsing YAML in ${filePath}: ${e.message}`);
        exitCode = 1;
        continue;
    }
    
    if (!parsedInput || typeof parsedInput !== 'object') {
        console.error(`Error: Invalid input format in ${filePath}.`);
        exitCode = 1;
        continue;
    }
    
    let jobResults = [];
    try {
        const matrixDefs = extractMatrices(parsedInput);
        if (matrixDefs.length === 0) {
            console.error(`Error: No matrix definitions found in ${filePath}.`);
            exitCode = 1;
            continue;
        }

        jobResults = matrixDefs.map(def => ({
            name: def.name,
            combinations: generateMatrix(def.matrix),
            line: findLineNumber(inputContent, def.name)
        }));
    } catch (e) {
        console.error(`Error generating matrix in ${filePath}: ${e.message}`);
        exitCode = 1;
        continue;
    }
    
    // Check for underspecified
    for (const job of jobResults) {
        const allKeys = new Set();
        job.combinations.forEach(combo => {
            Object.keys(combo).forEach(k => allKeys.add(k));
        });
        
        const underspecified = [];
        job.combinations.forEach((combo, idx) => {
             const missing = [];
             for (const k of allKeys) {
                 if (!Object.prototype.hasOwnProperty.call(combo, k)) {
                     missing.push(k);
                 }
             }
             if (missing.length > 0) {
                 underspecified.push({ combo, missing, index: idx });
             }
        });
        
        if (underspecified.length > 0) {
            if (checkMode && !allowUnderspecified) {
                 underspecified.forEach(u => {
                     const jobDesc = job.name === 'Job' ? 'matrix' : `job '${job.name}'`;
                     console.error(`${filePath}:${job.line}: Error: ${jobDesc} has underspecified combinations.`);
                     console.error(`  Missing keys: ${u.missing.join(', ')}`);
                     console.error(`  Combination: ${JSON.stringify(u.combo)}`);
                 });
                 exitCode = 1;
            }
        }
    }
    
    if (!checkMode) {
        allResults[filePath] = jobResults;
    }
}

if (checkMode) {
    if (exitCode === 0) {
        console.log('Matrix definitions are valid.');
    }
    process.exit(exitCode);
}

// Output logic for non-check mode
if (outputFormat === 'json') {
    const finalOutput = {};
    for (const [fPath, jobs] of Object.entries(allResults)) {
         const jobObj = {};
         jobs.forEach(j => { jobObj[j.name] = j.combinations; });
         
         // Backward compatibility for single file and generic Job name
         if (Object.keys(allResults).length === 1 && jobs.length === 1 && jobs[0].name === 'Job') {
             console.log(JSON.stringify(jobs[0].combinations, null, 2));
             process.exit(exitCode);
         }
         finalOutput[fPath] = jobObj;
    }
    console.log(JSON.stringify(finalOutput, null, 2));
} else {
    // YAML
    if (Object.keys(allResults).length === 1) {
        const jobs = Object.values(allResults)[0];
        if (jobs.length === 1 && jobs[0].name === 'Job') {
            console.log(jsyaml.dump(jobs[0].combinations));
        } else {
            const outputObj = {};
            jobs.forEach(j => { outputObj[j.name] = j.combinations; });
            console.log(jsyaml.dump(outputObj));
        }
    } else {
        const finalOutput = {};
        for (const [fPath, jobs] of Object.entries(allResults)) {
             const jobObj = {};
             jobs.forEach(j => { jobObj[j.name] = j.combinations; });
             finalOutput[fPath] = jobObj;
        }
        console.log(jsyaml.dump(finalOutput));
    }
}
process.exit(exitCode);
