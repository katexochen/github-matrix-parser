import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import jsyaml from 'js-yaml';
import { generateMatrix, extractMatrices } from '../../src/lib/matrix.js';
import os from 'os';

const CASES_DIR = 'tests/fixtures';
const WORKFLOW_FILE = '.github/workflows/systematic-generated.yml';

async function run() {
    const args = process.argv.slice(2);
    const skipExisting = args.includes('--skip-existing');

    console.log(`Loading test cases from ${CASES_DIR}...`);
    const files = fs.readdirSync(CASES_DIR).filter(f => f.endsWith('.yml') && !f.endsWith('_result.yml'));
    
    if (files.length === 0) {
        console.error('No test cases found.');
        process.exit(0);
    }
    
    const timestamp = Date.now();
    const branchName = `systematic-test-${timestamp}`;

    const workflow = {
        name: 'Systematic Matrix Tests',
        on: {
            push: {
                branches: [branchName]
            },
            workflow_dispatch: {}
        },
        jobs: {}
    };

    // Map: fixtureName -> { isRaw: boolean, jobs: { jobName: matrixDef } }
    const fixtureMeta = {}; 

    for (const caseFile of files) {
        const fixtureName = path.parse(caseFile).name;
        const resultFile = path.join(CASES_DIR, `${fixtureName}_result.yml`);

        if (skipExisting && fs.existsSync(resultFile)) {
            console.log(`Skipping ${caseFile} (result exists)`);
            continue;
        }

        const filePath = path.join(CASES_DIR, caseFile);
        const content = fs.readFileSync(filePath, 'utf8');
        const parsed = jsyaml.load(content);

        let matrices;
        try {
            matrices = extractMatrices(parsed);
        } catch (e) {
            console.error(`Error extracting matrices from ${caseFile}: ${e.message}`);
            continue;
        }

        if (matrices.length === 0) {
            console.warn(`No matrices found in ${caseFile}, skipping.`);
            continue;
        }

        const isRaw = matrices.length === 1 && matrices[0].name === 'Job';
        fixtureMeta[fixtureName] = { isRaw, jobNames: [] };

        for (const def of matrices) {
            // Unique ID for the workflow job: fixtureName_jobName
            // sanitize
            const cleanFixture = fixtureName.replace(/[^a-zA-Z0-9_-]/g, '_');
            const cleanJob = def.name.replace(/[^a-zA-Z0-9_-]/g, '_');
            const workflowJobId = `REQ_${cleanFixture}__${cleanJob}`;
            
            fixtureMeta[fixtureName].jobNames.push({
                originalName: def.name,
                workflowId: workflowJobId
            });

            workflow.jobs[workflowJobId] = {
                name: `${workflowJobId}: \${{ toJSON(matrix) }}`,
                'runs-on': 'ubuntu-latest',
                strategy: {
                    matrix: def.matrix,
                    'fail-fast': false
                },
                steps: [
                    { run: 'echo "Job ran"' }
                ]
            };
        }
    }

    if (Object.keys(workflow.jobs).length === 0) {
        console.log('No jobs to run.');
        process.exit(0);
    }

    const worktreePath = path.join(os.tmpdir(), `gh-matrix-parser-${timestamp}`);
    
    try {
        console.log(`Creating worktree at ${worktreePath} on branch ${branchName}...`);
        execSync(`git worktree add -b ${branchName} ${worktreePath} HEAD`);

        // Ensure .github/workflows exists in worktree
        const workflowDir = path.join(worktreePath, '.github/workflows');
        fs.mkdirSync(workflowDir, { recursive: true });

        // Write workflow file in worktree
        const yamlStr = jsyaml.dump(workflow);
        const workflowPath = path.join(worktreePath, WORKFLOW_FILE);
        fs.writeFileSync(workflowPath, yamlStr);
        console.log(`Generated workflow at ${workflowPath} with ${Object.keys(workflow.jobs).length} jobs.`);

        // Commit and push
        const execOptions = { cwd: worktreePath, stdio: 'inherit' };
        console.log('Committing changes...');
        execSync(`git add -f ${WORKFLOW_FILE}`, execOptions);
        execSync('git commit -m "Systematic test run"', execOptions);
        execSync(`git push origin ${branchName}`, execOptions);
        console.log('Pushed to GitHub.');

        console.log('Triggering workflow...');
        // We use workflow_dispatch because push events from GITHUB_TOKEN don't trigger workflows
        try {
            execSync(`gh workflow run systematic-generated.yml --ref ${branchName}`);
        } catch (e) {
            console.log('Failed to trigger workflow via dispatch (might have been triggered by push or not registered yet). Continuing to watch...');
        }

        console.log('Waiting for workflow run...');
        // We need to find the run ID.
        // Sleep a bit to let GitHub register the run
        await new Promise(r => setTimeout(r, 5000));

        // Get the latest run for this branch and workflow
        const runJson = execSync(`gh run list --workflow systematic-generated.yml --branch ${branchName} --limit 1 --json databaseId,status,conclusion`, { encoding: 'utf8' });
        const runs = JSON.parse(runJson);
        
        if (runs.length === 0) {
            console.error('No run found.');
            process.exit(1);
        }

        const runId = runs[0].databaseId;
        console.log(`Tracking run ID: ${runId}`);

        execSync(`gh run watch ${runId}`);
        console.log('Run completed.');

        // Get jobs
        const jobsJson = execSync(`gh run view ${runId} --json jobs`, { encoding: 'utf8' });
        const jobsData = JSON.parse(jobsJson);

        // Process results
        for (const [fixtureName, meta] of Object.entries(fixtureMeta)) {
            console.log(`Processing results for ${fixtureName}...`);
            
            const fixtureResults = {}; // name -> combinations[]

            for (const jobInfo of meta.jobNames) {
                // Find actual jobs for this workflowId
                // The job name in GitHub will be "workflowId: {"key":"val"}"
                const actualJobs = jobsData.jobs.filter(j => j.name.startsWith(`${jobInfo.workflowId}:`));
                
                const combinations = actualJobs.map(j => {
                    const prefix = `${jobInfo.workflowId}: `;
                    const jsonStr = j.name.substring(prefix.length);
                    try {
                        return JSON.parse(jsonStr);
                    } catch (e) {
                        console.error(`Failed to parse matrix from job name: ${j.name}`);
                        return null;
                    }
                }).filter(x => x);
                
                fixtureResults[jobInfo.originalName] = sortMatrices(combinations);
            }

            // Construct final output object
            let finalOutput;
            if (meta.isRaw) {
                // Single list
                finalOutput = fixtureResults['Job'] || [];
            } else {
                // Object map
                finalOutput = fixtureResults;
            }

            // Write to _result.yml
            const resultPath = path.join(CASES_DIR, `${fixtureName}_result.yml`);
            fs.writeFileSync(resultPath, jsyaml.dump(finalOutput));
            console.log(`Updated ${fixtureName}_result.yml`);
        }

        console.log('Done.');

    } catch (e) {
        console.error('Error:', e.message);
        if (e.stdout) console.log(e.stdout.toString());
        if (e.stderr) console.error(e.stderr.toString());
        process.exit(1);
    } finally {
        if (worktreePath && fs.existsSync(worktreePath)) {
            console.log('Cleaning up worktree...');
            try {
                // Remove worktree
                execSync(`git worktree remove --force ${worktreePath}`);
                // Remove local branch
                execSync(`git branch -D ${branchName}`);
                // Remove remote branch
                execSync(`git push origin --delete ${branchName}`);
            } catch (cleanupErr) {
                console.error('Error during cleanup:', cleanupErr.message);
            }
        }
    }
}

function sortMatrices(matrices) {
    return matrices.map(m => {
        // Sort keys
        const sorted = {};
        Object.keys(m).sort().forEach(k => sorted[k] = m[k]);
        return sorted;
    }).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

run();
