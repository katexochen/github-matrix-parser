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
