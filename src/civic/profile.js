/**
 * Introducing Molecular Profiles with CIViC GraphQL API v2.2.0
 * [EvidenceItem]--(many-to-one)--[MolecularProfile]--(many-to-many)--[Variant]
 */
//const { error: { ErrorMixin } } = require('@bcgsc-pori/graphkb-parser');
const { ParsingError, ErrorMixin, InputValidationError } = require('@bcgsc-pori/graphkb-parser');

class NotImplementedError extends ErrorMixin { }
const MOLECULAR_PROFILE_CACHE = new Map();

/**
 * Factory function returning a MolecularProfile object.
 * The process() method allows for the process of Civic's Molecular Profiles
 * After processing, the conditions property stores an array of GraphKB Statement's conditions
 *
 * @param {Object} molecularProfile a Molecular Profile segment from GraphQL query
 * @returns {MolecularProfile} object whose conditions' property is an array of lists of conditions
 */
const MolecularProfile = (molecularProfile) => ({
    /* Combine new conditional variants with existing conditions */
    _combine({ arr1, arr2 }) {
        const combinations = [];

        if (arr1[0].length === 0) {
            return arr2;
        }
        if (arr2[0].length === 0) {
            return arr1;
        }

        arr1.forEach((e1) => {
            arr2.forEach((e2) => {
                e2.forEach((variant) => {
                    combinations.push([...e1, variant]);
                });
            });
        });
        return combinations;
    },
    /* Compile parsed block into array of conditions' arrays */
    _compile({ arr, op, part }) {
        let conditions = [];

        switch (op) {
            case 'AND':
                arr.forEach((arrEl) => {
                    part.forEach((partEl) => {
                        conditions.push([...arrEl, ...partEl]);
                    });
                });
                break;

            case 'OR':
                if (arr[0].length === 0) {
                    conditions = [...part];
                } else {
                    conditions = [...arr, ...part];
                }
                break;

            default:
                break;
        }
        return conditions;
    },
    /* Desambiguation of variants with implicit 'or' in the name */
    _disambiguate() {
        const newConditions = [];

        // For each set of conditions
        this.conditions.forEach((condition) => {
            const temp = [];
            condition.forEach((variant) => {
                temp.push(
                    // Split ambiguous variants into an array of 1 or more variant(s)
                    this._split(variant),
                );
            });

            // Combine variations into new condition
            let newConditionSet;

            for (let i = 0; i < temp.length; i++) {
                newConditionSet = this._combine({ arr1: newConditionSet || [[]], arr2: temp[i] });
            }
            newConditions.push(...newConditionSet);
        });

        // Replace old conditions by new ones
        this.conditions = [...newConditions];
        return this;
    },
    /* Returns index of closing parenthesis for end of block */
    _end({ block, i, offset }) {
        let count = 1,
            j = 0;

        while (count > 0) {
            j++;

            if (block[i + offset + j].text) {
                switch (block[i + offset + j].text) {
                    case '(':
                        count++;
                        break;

                    case ')':
                        count--;
                        break;

                    default:
                        break;
                }
            }
        }
        return j;
    },
    /* Returns true if parsedName contains NOT operator(s), otherwise false */
    _not(parsedName) {
        for (let i = 0; i < parsedName.length; i++) {
            if (parsedName[i].text && parsedName[i].text === 'NOT') {
                return true;
            }
        }
        return false;
    },
    /* Parse block expression into array of conditions' arrays */
    _parse(block) {
        let conditions = [[]],
            offset = 0,
            op = 'OR'; // Default operator

        for (let i = 0; i + offset < block.length; i++) {
            const idx = i + offset;

            // If Variant
            if (block[idx].id) {
                // Add variant as a condition
                conditions = this._compile({
                    arr: conditions,
                    op,
                    part: [[block[idx].id]],
                });
                continue;
            }

            // If Nested block
            if (block[idx].text && block[idx].text === '(') {
                // Get end of block' index
                const j = this._end({
                    block,
                    i,
                    offset,
                });
                // Recursively parse nested block
                conditions = this._compile({
                    arr: conditions,
                    op,
                    part: this._parse(block.slice(idx + 1, idx + j)),
                });
                // New offset for rest of current block
                offset += j;
                continue;
            }

            // If Operator
            if (block[idx].text && ['AND', 'OR'].includes(block[idx].text)) {
                op = block[idx].text;
                continue;
            }
        }
        return conditions;
    },
    /* Splits variant's object into it's variations
     * Ex. {name: 'Q157P/R'} --> [[ {name: 'Q157P'} ], [ {name: 'Q157R'} ]] */
    _split(variant) {
        let orCombination;

        if (orCombination = /^([a-z]\d+)([a-z])\/([a-z])$/i.exec(variant.name)) {
            const [, prefix, tail1, tail2] = orCombination;
            return [
                [{ ...variant, name: `${prefix}${tail1}` }],
                [{ ...variant, name: `${prefix}${tail2}` }],
            ];
        }
        return [[variant]];
    },
    /* Convert variant ids to variant objects */
    _variants() {
        // Getting variants by ids from molecular profile's variants array
        const variantsById = {};
        this.profile.variants.forEach((variant) => {
            variantsById[variant.id] = variant;
        });

        // Refactoring conditions with variant objects
        const newConditions = [];
        this.conditions.forEach((condition) => {
            newConditions.push(condition.map(id => variantsById[id]));
        });

        // Check if any missing variant object
        newConditions.forEach((condition) => {
            condition.forEach((variant) => {
                if (!variant) {
                    const errMsg = `unable to process molecular profile with missing or misformatted variants (${this.profile.id || ''})`;
                    this.error = errMsg;
                    throw new Error(errMsg);
                }
            });
        });

        // Replacing conditions with ones with variant's objects
        this.conditions = newConditions;
        return this;
    },
    /* Corresponding GKB Statements' conditions (1 array per statement) */
    conditions: [[]],
    /* Keep track of processing error */
    error: undefined,
    /* Main object's method. Process expression into array of conditions' arrays */
    process() {
        // Get Molecular Profile's expression (parsedName property)
        const { parsedName } = this.profile;

        // Check for expression's format
        if (!parsedName
            || !Array.isArray(parsedName)
            || parsedName.length === 0
            || typeof parsedName[0] !== 'object'
        ) {
            const errMsg = `unable to process molecular profile with missing or misformatted parsedName (${this.profile.id || ''})`;
            this.error = errMsg;
            throw new Error(errMsg);
        }
        // NOT operator not yet supported
        if (this._not(parsedName)) {
            const errMsg = `unable to process molecular profile with NOT operator (${this.profile.id || ''})`;
            this.error = errMsg;
            throw new NotImplementedError(errMsg);
        }
        // Filters out unwanted Feature info from expression
        const filteredParsedName = parsedName.filter(el => el.__typename !== 'Feature');

        // Parse expression into conditions
        this.conditions = this._parse(filteredParsedName);
        // Replace Variant's ids with corresponding Variant's objects
        this._variants();
        // Disambiguate Variants' names with implicit 'or'
        this._disambiguate();
        return this;
    },
    /* CIViC Evidence Item's Molecular Profile segment */
    profile: molecularProfile || {},
});

/**
 * Processing a molecular profile expression while managing the cache
 *
 * @param {Object} molecularProfile a Molecular Profile segment from GraphQL query
 * @returns {MolecularProfile} object whose conditions' property is an array of lists of conditions
 */
const processMolecularProfile = (molecularProfile) => {
    let Mp = MOLECULAR_PROFILE_CACHE.get(molecularProfile.id);

    if (Mp) {
        if (Mp.error) {
            throw new Error(
                `Molecular profile ${molecularProfile.id} already processed with error "${Mp.error}"`,
            );
        }
        return Mp;
    }
    Mp = MolecularProfile(molecularProfile);

    // Actually process the profile expression
    try {
        Mp.process();
    } catch (err) {
        MOLECULAR_PROFILE_CACHE.set(molecularProfile.id, Mp);
        throw err;
    }
    MOLECULAR_PROFILE_CACHE.set(molecularProfile.id, Mp);

    return Mp;
};

module.exports = {
    MolecularProfile,
    processMolecularProfile,
};
