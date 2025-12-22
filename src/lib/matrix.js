export function extractMatrices(parsed) {
    if (!parsed || typeof parsed !== 'object') return [];

    const results = [];

    // 1. Check for 'jobs' key (Full workflow)
    if (parsed.jobs && typeof parsed.jobs === 'object') {
        for (const [jobId, job] of Object.entries(parsed.jobs)) {
            if (job && job.strategy && job.strategy.matrix) {
                results.push({
                    name: job.name || jobId,
                    matrix: job.strategy.matrix
                });
            }
        }
        if (results.length > 0) return results;
    }

    // 2. Check if it's a dict of jobs (heuristic: values are objects with strategy)
    // Avoid false positives if it's just a matrix with object values.
    // A matrix usually has array values. A job dict has object values.
    const keys = Object.keys(parsed);
    const isJobDict = keys.length > 0 && keys.every(k => {
        const val = parsed[k];
        // Must be object, not array. And usually has 'runs-on', 'steps', or 'strategy'.
        // If it has 'strategy', likely a job.
        return val && typeof val === 'object' && !Array.isArray(val) && (val.strategy || val.steps || val['runs-on']);
    });

    if (isJobDict) {
        for (const [jobId, job] of Object.entries(parsed)) {
            if (job && job.strategy && job.strategy.matrix) {
                results.push({
                    name: job.name || jobId,
                    matrix: job.strategy.matrix
                });
            }
        }
        if (results.length > 0) return results;
    }

    // 3. Check for 'strategy' key
    if (parsed.strategy && parsed.strategy.matrix) {
        return [{ name: 'Job', matrix: parsed.strategy.matrix }];
    }

    // 4. Check for 'matrix' key
    if (parsed.matrix) {
        return [{ name: 'Job', matrix: parsed.matrix }];
    }

    // 5. Assume it's a raw matrix
    // If it looks like a matrix (values are arrays), treat as one.
    // If valid matrix (generateMatrix returns something), return it.
    // We assume it's a single matrix if we reached here.
    return [{ name: 'Job', matrix: parsed }];
}

export function generateMatrix(matrix) {
    if (!matrix || typeof matrix !== 'object') return [];

    const include = Array.isArray(matrix.include) ? matrix.include : [];
    const exclude = Array.isArray(matrix.exclude) ? matrix.exclude : [];

    // Identify dimensions: keys that are arrays and not include/exclude
    const dimensions = {};
    for (const key in matrix) {
        if (key !== 'include' && key !== 'exclude' && Array.isArray(matrix[key])) {
            dimensions[key] = matrix[key];
        }
    }

    const dimensionKeys = Object.keys(dimensions);
    
    let combinations = [];

    if (dimensionKeys.length === 0) {
        // If no dimensions, start with one empty combination to allow includes to match/add
        combinations.push({});
    } else {
        // Cartesian product
        combinations = cartesianProduct(dimensions);
    }

    // Apply excludes
    if (exclude.length > 0) {
        combinations = combinations.filter(combo => {
            // Keep if it does NOT match any exclude rule
            return !exclude.some(rule => isExcludeMatch(combo, rule));
        });
    }

    // Apply includes
    // "All include entries are processed against the original matrix combinations."
    // Original combinations are modified in place if matched.
    // If NO match found in original combinations, the include is added as a NEW combination.
    // New combinations added by includes are NOT candidates for subsequent includes.
    
    // We keep 'combinations' as the list of original (mutable) jobs.
    // We'll collect new jobs in 'extraCombinations'.
    const extraCombinations = [];

    for (const item of include) {
        const matches = [];
        // Only match against the original set (which might have been modified by previous includes)
        // Matching is done based on dimension keys only.
        for (const combo of combinations) {
            if (isIncludeMatch(combo, item, dimensionKeys)) {
                matches.push(combo);
            }
        }
        
        if (matches.length > 0) {
            // Modify existing matches
            for (const match of matches) {
                Object.assign(match, item);
            }
        } else {
            extraCombinations.push({...item});
        }
    }

    return [...combinations, ...extraCombinations];
}

function cartesianProduct(dimensions) {
    const keys = Object.keys(dimensions);
    const values = keys.map(k => dimensions[k]);
    
    const results = [];
    
    function helper(arr, i) {
        if (i === keys.length) {
            results.push(arr);
            return;
        }
        
        for (const val of values[i]) {
            const newObj = {...arr};
            newObj[keys[i]] = val;
            helper(newObj, i + 1);
        }
    }
    
    helper({}, 0);
    return results;
}

function isExcludeMatch(candidate, rule) {
    // For exclude: All keys in rule must exist in candidate and have equal values
    for (const key in rule) {
        if (candidate[key] === undefined || !isEqual(candidate[key], rule[key])) {
            return false;
        }
    }
    return true;
}

function isIncludeMatch(candidate, rule, dimensionKeys) {
    // For include: 
    // We only check keys that are PART OF THE DIMENSIONS.
    // This allows includes to update existing jobs even if those jobs have been modified by previous includes
    // (e.g. adding a property that differs from the current rule).
    // Non-dimension keys in the rule are payload to be added/updated, not criteria for matching.
    
    for (const key of dimensionKeys) {
        // If the rule has this dimension key, it must match the candidate
        if (Object.prototype.hasOwnProperty.call(rule, key)) {
            if (!isEqual(candidate[key], rule[key])) {
                return false;
            }
        }
    }
    
    return true;
}

function isEqual(a, b) {
    if (a === b) return true;
    if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return false;
    
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    
    if (keysA.length !== keysB.length) return false;
    
    for (const key of keysA) {
        if (!keysB.includes(key)) return false;
        if (!isEqual(a[key], b[key])) return false;
    }
    
    return true;
}
