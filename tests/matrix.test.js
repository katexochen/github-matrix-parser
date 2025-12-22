import { describe, it, expect } from 'vitest';
import { generateMatrix } from '../src/lib/matrix.js';
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
        console.warn(`Skipping ${testName}: No result file found at ${resultPath}`);
        return;
      }

      const inputYaml = fs.readFileSync(inputPath, 'utf8');
      const expectedYaml = fs.readFileSync(resultPath, 'utf8');
      
      const parsedInput = jsyaml.load(inputYaml);
      const expectedOutput = jsyaml.load(expectedYaml);
      
      // Support parsing full workflow file or just matrix
      let matrixDef = parsedInput;
      if (parsedInput && parsedInput.matrix) {
          matrixDef = parsedInput.matrix;
      } else if (parsedInput && parsedInput.strategy && parsedInput.strategy.matrix) {
          matrixDef = parsedInput.strategy.matrix;
      }
  
      const result = generateMatrix(matrixDef);
      
      expect(result).toEqual(expectedOutput);
    });
  });
});
