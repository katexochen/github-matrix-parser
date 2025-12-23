import { describe, it, expect } from 'vitest';
import { generateMatrix, extractMatrices } from '../src/lib/matrix.js';
import jsyaml from 'js-yaml';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Matrix Generator', () => {
  const fixturesDir = path.join(__dirname, 'fixtures');
  const files = fs.readdirSync(fixturesDir);
  
  // Filter for input files (exclude result files)
  const testCases = files.filter(file => file.endsWith('.yml') && !file.endsWith('_result.yml'));

  testCases.forEach(testCaseFile => {
    const testName = path.basename(testCaseFile, '.yml');
    
    it(`should pass ${testName}`, () => {
      const inputPath = path.join(fixturesDir, testCaseFile);
      const resultPath = path.join(fixturesDir, `${testName}_result.yml`);
      
      if (!fs.existsSync(resultPath)) {
        throw new Error(`Test failure: No result file found for ${testName} at ${resultPath}`);
      }

      const inputYaml = fs.readFileSync(inputPath, 'utf8');
      const expectedYaml = fs.readFileSync(resultPath, 'utf8');
      
      const parsedInput = jsyaml.load(inputYaml);
      const expectedOutput = jsyaml.load(expectedYaml);
      
      // Use extractMatrices to handle all input types (full workflow, matrix, etc.)
      const matrixDefs = extractMatrices(parsedInput);
      
      let result;
      if (matrixDefs.length === 1 && matrixDefs[0].name === 'Job') {
          // Backward compatibility for tests expecting a simple array result
          // If the extractor found a single generic job (raw matrix), just return the array.
          // BUT check if the expected output is an object with job names?
          if (Array.isArray(expectedOutput)) {
              result = generateMatrix(matrixDefs[0].matrix);
          } else {
               // Expected output is a dict, so we should map to dict
               const outputObj = {};
               matrixDefs.forEach(def => {
                   outputObj[def.name] = generateMatrix(def.matrix);
               });
               result = outputObj;
          }
      } else {
          // Multiple jobs or named jobs, construct result object keyed by job name
          const outputObj = {};
          matrixDefs.forEach(def => {
              outputObj[def.name] = generateMatrix(def.matrix);
          });
          result = outputObj;
      }

      const normalizedResult = normalizeResult(result);
      const normalizedExpected = normalizeResult(expectedOutput);

      expect(normalizedResult).toEqual(normalizedExpected);
    });
  });
});

function normalizeResult(res) {
    if (Array.isArray(res)) {
        return sortCombinations(res);
    } else if (typeof res === 'object' && res !== null) {
        const normalized = {};
        Object.keys(res).sort().forEach(key => {
            normalized[key] = sortCombinations(res[key]);
        });
        return normalized;
    }
    return res;
}

function sortCombinations(combinations) {
    if (!Array.isArray(combinations)) return combinations;
    return combinations.map(combo => {
        // Sort keys within the object
        const sortedKeys = Object.keys(combo).sort();
        const sortedCombo = {};
        sortedKeys.forEach(key => sortedCombo[key] = combo[key]);
        return sortedCombo;
    }).sort((a, b) => {
        // Sort the array of objects
        return JSON.stringify(a).localeCompare(JSON.stringify(b));
    });
}

