const { error: { ErrorMixin } } = require('@bcgsc-pori/graphkb-parser');

class NotImplementedError extends ErrorMixin { }


/**
 * Factory function returning a MolecularProfile object. The process() method
 * allows for the process of Civic's Molecular Profiles into GraphKB Statement's conditions
 *
 * @param {Object} molecularProfile Molecular Profile segment from GraphQL query
 * @returns {Array[]} An array of arrays, each of which is a list of conditions for 1 GraphKB' Statement
 */
const MolecularProfile = (molecularProfile) => ({
    /* Compile parsed block into array of conditions' arrays */
    _compile({ arr, op, part }) {
        let conditions = [];

        switch (op) {
            case 'AND':
                arr.forEach((ArrEl) => {
                    part.forEach((partEl) => {
                        conditions.push([...ArrEl, ...partEl]);
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
            op = 'OR';

        for (let i = 0; i + offset < block.length; i++) {
            const idx = i + offset;

            // If Variant
            if (block[idx].id) {
                // Add variant condition
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
    /* Convert conditions' variant ids to variant objects */
    _variants(conditions) {
        // Getting variants by ids from molecular profile's variants array
        const variantsById = {};
        this.profile.variants.forEach((variant) => {
            variantsById[variant.id] = variant;
        });

        // Refactoring conditions with variant objects
        const temp = [];
        conditions.forEach((condition) => {
            try {
                temp.push(condition.map(id => variantsById[id]));
            } catch (err) {
                throw new Error(
                    `unable to process molecular profile with missing or misformatted variants (${this.profile.id || ''})`,
                );
            }
        });
        return temp;
    },
    /* Main object's method. Process expression into array of conditions' arrays */
    process() {
        const { parsedName } = this.profile;

        // Check for expression (parsedName property) on Molecular Profile
        if (!parsedName
            || !Array.isArray(parsedName)
            || parsedName.length === 0
            || typeof parsedName[0] !== 'object'
        ) {
            throw new Error(
                `unable to process molecular profile with missing or misformatted parsedName (${this.profile.id || ''})`,
            );
        }
        // Check for NOT operator in expression (not yet supported)
        if (this._not(parsedName)) {
            throw new NotImplementedError(
                `unable to process molecular profile with NOT operator (${this.profile.id || ''})`,
            );
        }

        // Filters out unwanted gene's info from expression
        const filteredParsedName = parsedName.filter(el => !el.entrezId);

        // Parse expression into conditions and get variant objects from ids
        return this._variants(
            this._parse(filteredParsedName),
        );
    },
    profile: molecularProfile || {},
});


module.exports = {
    MolecularProfile,
};
