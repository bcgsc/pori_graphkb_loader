const stripSQL = string => string
    .replace(/\s+\./g, '.')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/\s+/g, ' ')
    .trim();


const printFunctionName = (func, value) => {
    if (value instanceof Function) {
        return `[Function: ${value.name || value.toString()}]`;
    }
    return value;
};

module.exports = {stripSQL, printFunctionName};
