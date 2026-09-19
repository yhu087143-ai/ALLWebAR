/**
 * @typedef {Object} ToolParameter
 * @property {string} name
 * @property {'string'|'number'|'boolean'} type
 * @property {string} description
 * @property {boolean} required
 * @property {string[]} [enum]
 */

/**
 * @typedef {Object} ToolDefinition
 * @property {string} name
 * @property {string} description
 * @property {'game'|'guide'|'generation'|'design'} category
 * @property {ToolParameter[]} parameters
 * @property {(args: Object, ctx: {baseUrl: string}) => Promise<{success: boolean, data?: any, message: string}>} execute
 */

export default {};
