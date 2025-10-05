import Ajv, { ErrorObject, ValidateFunction } from 'ajv';
import type { ParameterContext } from '../../shared/nodeGraphSchema.js';

type SafePrimitive = string | number | boolean | null | undefined;

type ExpressionEvaluationInput = Pick<ParameterContext, 'nodeOutputs' | 'currentNodeId' | 'workflowId' | 'executionId' | 'userId' | 'trigger' | 'steps' | 'variables'> & {
  vars?: Record<string, any>;
};

export type ExpressionTypeHint =
  | 'string'
  | 'number'
  | 'boolean'
  | 'array'
  | 'object'
  | 'date'
  | 'null'
  | 'undefined'
  | 'unknown';

type TokenType =
  | 'number'
  | 'string'
  | 'identifier'
  | 'operator'
  | 'punctuation'
  | 'boolean'
  | 'null'
  | 'eof';

interface Token {
  type: TokenType;
  value: string;
  position: number;
}

interface LiteralNode {
  type: 'Literal';
  value: any;
}

interface IdentifierNode {
  type: 'Identifier';
  name: string;
}

interface UnaryNode {
  type: 'UnaryExpression';
  operator: string;
  argument: ASTNode;
}

interface BinaryNode {
  type: 'BinaryExpression';
  operator: string;
  left: ASTNode;
  right: ASTNode;
}

interface LogicalNode {
  type: 'LogicalExpression';
  operator: string;
  left: ASTNode;
  right: ASTNode;
}

interface MemberNode {
  type: 'MemberExpression';
  object: ASTNode;
  property: ASTNode | IdentifierNode;
  computed: boolean;
}

interface CallNode {
  type: 'CallExpression';
  callee: ASTNode;
  arguments: ASTNode[];
}

type ASTNode =
  | LiteralNode
  | IdentifierNode
  | UnaryNode
  | BinaryNode
  | LogicalNode
  | MemberNode
  | CallNode;

const SAFE_MATH = Object.freeze({
  abs: Math.abs,
  ceil: Math.ceil,
  floor: Math.floor,
  round: Math.round,
  max: Math.max,
  min: Math.min,
  pow: Math.pow,
  sqrt: Math.sqrt,
  log: Math.log,
  log10: Math.log10,
  exp: Math.exp,
  random: Math.random,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
});

const SAFE_NUMBER = Object.freeze({
  parse: (value: SafePrimitive) => Number(value),
  isFinite: (value: SafePrimitive) => Number.isFinite(Number(value)),
  isNaN: (value: SafePrimitive) => Number.isNaN(Number(value)),
});

const SAFE_STRING = Object.freeze({
  toUpperCase: (value: SafePrimitive) => String(value ?? '').toUpperCase(),
  toLowerCase: (value: SafePrimitive) => String(value ?? '').toLowerCase(),
  includes: (value: SafePrimitive, search: SafePrimitive) =>
    String(value ?? '').includes(String(search ?? '')),
  trim: (value: SafePrimitive) => String(value ?? '').trim(),
  length: (value: SafePrimitive) => String(value ?? '').length,
});

const SAFE_ARRAY = Object.freeze({
  length: (value: unknown) => (Array.isArray(value) ? value.length : 0),
  includes: (value: unknown, search: unknown) =>
    Array.isArray(value) ? value.includes(search) : false,
  first: <T>(value: T[]) => (Array.isArray(value) ? value[0] : undefined),
  last: <T>(value: T[]) => (Array.isArray(value) ? value[value.length - 1] : undefined),
  compact: (value: unknown[]) => (Array.isArray(value) ? value.filter(Boolean) : []),
  flatten: (value: unknown[]) =>
    Array.isArray(value) ? value.flat(Infinity) : [],
});

const SAFE_DATE = Object.freeze({
  now: () => new Date().toISOString(),
  parseISO: (value: SafePrimitive) =>
    typeof value === 'string' ? new Date(value).toISOString() : undefined,
  diffInMs: (a: SafePrimitive, b: SafePrimitive) =>
    new Date(a as string).getTime() - new Date(b as string).getTime(),
});

const SAFE_JSON = Object.freeze({
  stringify: (value: unknown) => JSON.stringify(value),
  parse: (value: SafePrimitive) =>
    typeof value === 'string' ? JSON.parse(value) : undefined,
});

const SAFE_BOOL = Object.freeze({
  not: (value: unknown) => !value,
  and: (a: unknown, b: unknown) => Boolean(a && b),
  or: (a: unknown, b: unknown) => Boolean(a || b),
});

const JSONATA_FUNCTIONS = Object.freeze({
  $uppercase: (value: SafePrimitive) => String(value ?? '').toUpperCase(),
  $lowercase: (value: SafePrimitive) => String(value ?? '').toLowerCase(),
  $contains: (sequence: unknown, search: unknown) => {
    if (Array.isArray(sequence)) {
      return sequence.includes(search);
    }
    return String(sequence ?? '').includes(String(search ?? ''));
  },
  $not: (value: unknown) => !value,
  $string: (value: unknown) => (value === undefined || value === null ? '' : String(value)),
  $number: (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  },
  $boolean: (value: unknown) => Boolean(value),
  $count: (value: unknown) => {
    if (Array.isArray(value)) {
      return value.length;
    }
    if (typeof value === 'string') {
      return value.length;
    }
    if (value && typeof value === 'object') {
      return Object.keys(value as Record<string, any>).length;
    }
    return 0;
  },
  $sum: (values: unknown) =>
    Array.isArray(values)
      ? values.reduce((total, current) => total + (Number(current) || 0), 0)
      : 0,
  $average: (values: unknown) => {
    if (!Array.isArray(values) || values.length === 0) {
      return 0;
    }
    const sum = values.reduce((total, current) => total + (Number(current) || 0), 0);
    return sum / values.length;
  },
  $max: (values: unknown) =>
    Array.isArray(values) && values.length > 0
      ? values.reduce((max, current) => Math.max(max, Number(current) || 0), Number.NEGATIVE_INFINITY)
      : undefined,
  $min: (values: unknown) =>
    Array.isArray(values) && values.length > 0
      ? values.reduce((min, current) => Math.min(min, Number(current) || 0), Number.POSITIVE_INFINITY)
      : undefined,
  $exists: (value: unknown) => value !== undefined && value !== null,
});

const SAFE_GLOBALS = Object.freeze({
  math: SAFE_MATH,
  number: SAFE_NUMBER,
  string: SAFE_STRING,
  array: SAFE_ARRAY,
  date: SAFE_DATE,
  json: SAFE_JSON,
  bool: SAFE_BOOL,
  ...JSONATA_FUNCTIONS,
});

const THREE_CHAR_OPERATORS = new Set(['===', '!==']);
const TWO_CHAR_OPERATORS = new Set(['==', '!=', '>=', '<=', '&&', '||']);
const SINGLE_CHAR_OPERATORS = new Set(['+', '-', '*', '/', '%', '>', '<']);
const PUNCTUATION = new Set(['(', ')', '.', ',', '[', ']']);

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  const length = input.length;
  let position = 0;

  const isWhitespace = (char: string) => /\s/.test(char);
  const isDigit = (char: string) => /[0-9]/.test(char);
  const isIdentifierStart = (char: string) => /[A-Za-z_$]/.test(char);
  const isIdentifierPart = (char: string) => /[A-Za-z0-9_$]/.test(char);

  while (position < length) {
    const char = input[position];

    if (isWhitespace(char)) {
      position += 1;
      continue;
    }

    if (char === '"' || char === '\'') {
      let value = '';
      position += 1;
      while (position < length) {
        const current = input[position];
        if (current === char) {
          position += 1;
          break;
        }
        if (current === '\\') {
          const nextChar = input[position + 1];
          if (nextChar) {
            value += nextChar;
            position += 2;
            continue;
          }
        }
        value += current;
        position += 1;
      }
      tokens.push({ type: 'string', value, position });
      continue;
    }

    if (isDigit(char) || (char === '.' && isDigit(input[position + 1] ?? ''))) {
      let value = char;
      position += 1;
      while (position < length) {
        const current = input[position];
        if (!/[0-9.]/.test(current)) {
          break;
        }
        value += current;
        position += 1;
      }
      tokens.push({ type: 'number', value, position });
      continue;
    }

    if (THREE_CHAR_OPERATORS.has(input.slice(position, position + 3))) {
      const operator = input.slice(position, position + 3);
      tokens.push({ type: 'operator', value: operator, position });
      position += 3;
      continue;
    }

    if (TWO_CHAR_OPERATORS.has(input.slice(position, position + 2))) {
      const operator = input.slice(position, position + 2);
      tokens.push({ type: 'operator', value: operator, position });
      position += 2;
      continue;
    }

    if (SINGLE_CHAR_OPERATORS.has(char)) {
      tokens.push({ type: 'operator', value: char, position });
      position += 1;
      continue;
    }

    if (PUNCTUATION.has(char)) {
      tokens.push({ type: 'punctuation', value: char, position });
      position += 1;
      continue;
    }

    if (isIdentifierStart(char)) {
      let identifier = char;
      position += 1;
      while (position < length && isIdentifierPart(input[position])) {
        identifier += input[position];
        position += 1;
      }

      if (identifier === 'true' || identifier === 'false') {
        tokens.push({ type: 'boolean', value: identifier, position });
        continue;
      }

      if (identifier === 'null') {
        tokens.push({ type: 'null', value: identifier, position });
        continue;
      }

      tokens.push({ type: 'identifier', value: identifier, position });
      continue;
    }

    throw new Error(`Unexpected character '${char}' at position ${position}`);
  }

  tokens.push({ type: 'eof', value: '', position });
  return tokens;
}

class Parser {
  private index = 0;

  constructor(private readonly tokens: Token[]) {}

  parseExpression(): ASTNode {
    return this.parseLogicalOr();
  }

  private parseLogicalOr(): ASTNode {
    let left = this.parseLogicalAnd();
    while (true) {
      if (this.matchOperator('||')) {
        const right = this.parseLogicalAnd();
        left = { type: 'LogicalExpression', operator: '||', left, right };
        continue;
      }
      break;
    }
    return left;
  }

  private parseLogicalAnd(): ASTNode {
    let left = this.parseEquality();
    while (true) {
      if (this.matchOperator('&&')) {
        const right = this.parseEquality();
        left = { type: 'LogicalExpression', operator: '&&', left, right };
        continue;
      }
      break;
    }
    return left;
  }

  private parseEquality(): ASTNode {
    let left = this.parseRelational();
    while (true) {
      if (this.matchOperator('==')) {
        const right = this.parseRelational();
        left = { type: 'BinaryExpression', operator: '==', left, right };
        continue;
      }
      if (this.matchOperator('!=')) {
        const right = this.parseRelational();
        left = { type: 'BinaryExpression', operator: '!=', left, right };
        continue;
      }
      if (this.matchOperator('===')) {
        const right = this.parseRelational();
        left = { type: 'BinaryExpression', operator: '===', left, right };
        continue;
      }
      if (this.matchOperator('!==')) {
        const right = this.parseRelational();
        left = { type: 'BinaryExpression', operator: '!==', left, right };
        continue;
      }
      break;
    }
    return left;
  }

  private parseRelational(): ASTNode {
    let left = this.parseAdditive();
    while (true) {
      if (this.matchOperator('>')) {
        const right = this.parseAdditive();
        left = { type: 'BinaryExpression', operator: '>', left, right };
        continue;
      }
      if (this.matchOperator('<')) {
        const right = this.parseAdditive();
        left = { type: 'BinaryExpression', operator: '<', left, right };
        continue;
      }
      if (this.matchOperator('>=')) {
        const right = this.parseAdditive();
        left = { type: 'BinaryExpression', operator: '>=', left, right };
        continue;
      }
      if (this.matchOperator('<=')) {
        const right = this.parseAdditive();
        left = { type: 'BinaryExpression', operator: '<=', left, right };
        continue;
      }
      break;
    }
    return left;
  }

  private parseAdditive(): ASTNode {
    let left = this.parseMultiplicative();
    while (true) {
      if (this.matchOperator('+')) {
        const right = this.parseMultiplicative();
        left = { type: 'BinaryExpression', operator: '+', left, right };
        continue;
      }
      if (this.matchOperator('-')) {
        const right = this.parseMultiplicative();
        left = { type: 'BinaryExpression', operator: '-', left, right };
        continue;
      }
      break;
    }
    return left;
  }

  private parseMultiplicative(): ASTNode {
    let left = this.parseUnary();
    while (true) {
      if (this.matchOperator('*')) {
        const right = this.parseUnary();
        left = { type: 'BinaryExpression', operator: '*', left, right };
        continue;
      }
      if (this.matchOperator('/')) {
        const right = this.parseUnary();
        left = { type: 'BinaryExpression', operator: '/', left, right };
        continue;
      }
      if (this.matchOperator('%')) {
        const right = this.parseUnary();
        left = { type: 'BinaryExpression', operator: '%', left, right };
        continue;
      }
      break;
    }
    return left;
  }

  private parseUnary(): ASTNode {
    if (this.matchOperator('!')) {
      const argument = this.parseUnary();
      return { type: 'UnaryExpression', operator: '!', argument };
    }
    if (this.matchOperator('-')) {
      const argument = this.parseUnary();
      return { type: 'UnaryExpression', operator: '-', argument };
    }
    return this.parseMember();
  }

  private parseMember(): ASTNode {
    let object = this.parsePrimary();

    while (true) {
      if (this.matchPunctuation('.')) {
        const propertyToken = this.consume();
        if (propertyToken.type !== 'identifier') {
          throw new Error(`Expected identifier after '.' at position ${propertyToken.position}`);
        }
        object = {
          type: 'MemberExpression',
          object,
          property: { type: 'Identifier', name: propertyToken.value },
          computed: false,
        };
        continue;
      }

      if (this.matchPunctuation('[')) {
        const property = this.parseExpression();
        this.expectPunctuation(']');
        object = {
          type: 'MemberExpression',
          object,
          property,
          computed: true,
        };
        continue;
      }

      if (this.matchPunctuation('(')) {
        const args: ASTNode[] = [];
        if (!this.checkPunctuation(')')) {
          do {
            args.push(this.parseExpression());
          } while (this.matchPunctuation(','));
        }
        this.expectPunctuation(')');
        object = { type: 'CallExpression', callee: object, arguments: args };
        continue;
      }

      break;
    }

    return object;
  }

  private parsePrimary(): ASTNode {
    const token = this.consume();
    switch (token.type) {
      case 'number':
        return { type: 'Literal', value: Number(token.value) };
      case 'string':
        return { type: 'Literal', value: token.value };
      case 'boolean':
        return { type: 'Literal', value: token.value === 'true' };
      case 'null':
        return { type: 'Literal', value: null };
      case 'identifier':
        return { type: 'Identifier', name: token.value };
      case 'punctuation':
        if (token.value === '(') {
          const expression = this.parseLogicalOr();
          this.expectPunctuation(')');
          return expression;
        }
        throw new Error(`Unexpected token '${token.value}' at position ${token.position}`);
      default:
        throw new Error(`Unexpected token '${token.value}' at position ${token.position}`);
    }
  }

  private consume(): Token {
    const token = this.tokens[this.index];
    this.index += 1;
    return token;
  }

  private matchOperator(operator: string): boolean {
    const token = this.tokens[this.index];
    if (token && token.type === 'operator' && token.value === operator) {
      this.index += 1;
      return true;
    }
    return false;
  }

  private matchPunctuation(punctuation: string): boolean {
    const token = this.tokens[this.index];
    if (token && token.type === 'punctuation' && token.value === punctuation) {
      this.index += 1;
      return true;
    }
    return false;
  }

  private expectPunctuation(punctuation: string): void {
    const token = this.tokens[this.index];
    if (!token || token.type !== 'punctuation' || token.value !== punctuation) {
      throw new Error(`Expected '${punctuation}' at position ${token?.position ?? 'end of input'}`);
    }
    this.index += 1;
  }

  private checkPunctuation(punctuation: string): boolean {
    const token = this.tokens[this.index];
    return Boolean(token && token.type === 'punctuation' && token.value === punctuation);
  }
}

function compile(input: string): (scope: Record<string, any>) => any {
  const tokens = tokenize(input);
  const parser = new Parser(tokens);
  const ast = parser.parseExpression();
  return (scope: Record<string, any>) => evaluateAST(ast, scope);
}

function evaluateAST(node: ASTNode, scope: Record<string, any>): any {
  switch (node.type) {
    case 'Literal':
      return node.value;
    case 'Identifier':
      return scope[node.name];
    case 'UnaryExpression':
      return evaluateUnary(node, scope);
    case 'BinaryExpression':
      return evaluateBinary(node, scope);
    case 'LogicalExpression':
      return evaluateLogical(node, scope);
    case 'MemberExpression':
      return evaluateMember(node, scope);
    case 'CallExpression':
      return evaluateCall(node, scope);
    default:
      throw new Error(`Unsupported AST node type ${(node as any).type}`);
  }
}

function evaluateUnary(node: UnaryNode, scope: Record<string, any>): any {
  const argument = evaluateAST(node.argument, scope);
  switch (node.operator) {
    case '!':
      return !argument;
    case '-':
      return -Number(argument);
    default:
      throw new Error(`Unsupported unary operator ${node.operator}`);
  }
}

function evaluateBinary(node: BinaryNode, scope: Record<string, any>): any {
  const left = evaluateAST(node.left, scope);
  const right = evaluateAST(node.right, scope);

  switch (node.operator) {
    case '+':
      return (left as any) + (right as any);
    case '-':
      return Number(left) - Number(right);
    case '*':
      return Number(left) * Number(right);
    case '/':
      return Number(left) / Number(right);
    case '%':
      return Number(left) % Number(right);
    case '<':
      return (left as any) < (right as any);
    case '>':
      return (left as any) > (right as any);
    case '<=':
      return (left as any) <= (right as any);
    case '>=':
      return (left as any) >= (right as any);
    case '==':
      return left == right; // eslint-disable-line eqeqeq
    case '!=':
      return left != right; // eslint-disable-line eqeqeq
    case '===':
      return left === right;
    case '!==':
      return left !== right;
    default:
      throw new Error(`Unsupported binary operator ${node.operator}`);
  }
}

function evaluateLogical(node: LogicalNode, scope: Record<string, any>): any {
  if (node.operator === '&&') {
    const left = evaluateAST(node.left, scope);
    return left ? evaluateAST(node.right, scope) : left;
  }
  if (node.operator === '||') {
    const left = evaluateAST(node.left, scope);
    return left ? left : evaluateAST(node.right, scope);
  }
  throw new Error(`Unsupported logical operator ${node.operator}`);
}

function evaluateMember(node: MemberNode, scope: Record<string, any>): any {
  const object = evaluateAST(node.object, scope);
  if (object === null || object === undefined) {
    return undefined;
  }

  if (Array.isArray(object)) {
    if (node.computed) {
      return evaluateArrayComputedMember(object, node.property as ASTNode, scope);
    }

    const propertyName = (node.property as IdentifierNode).name;
    return object.map(item => {
      if (item === null || item === undefined) {
        return undefined;
      }
      if (typeof item === 'object') {
        return (item as any)[propertyName];
      }
      return undefined;
    });
  }

  const property = node.computed
    ? evaluateAST(node.property as ASTNode, scope)
    : (node.property as IdentifierNode).name;

  if (property === null || property === undefined) {
    return undefined;
  }

  if (typeof property === 'symbol') {
    return undefined;
  }

  if (typeof object === 'object' || typeof object === 'function') {
    if (Object.prototype.hasOwnProperty.call(object, property)) {
      return (object as any)[property];
    }
    if (Array.isArray(object) && typeof property === 'number') {
      return object[property];
    }
    return (object as any)[property];
  }

  return undefined;
}

function evaluateArrayComputedMember(array: any[], propertyNode: ASTNode, scope: Record<string, any>): any {
  if (propertyNode.type === 'Literal') {
    const literalValue = propertyNode.value;
    if (typeof literalValue === 'number') {
      return array[literalValue];
    }
    if (typeof literalValue === 'string') {
      return array.map(item => (item ? (item as any)[literalValue] : undefined));
    }
  }

  if (propertyNode.type === 'Identifier') {
    const key = propertyNode.name;
    if (key === 'length') {
      return array.length;
    }
    return array.map(item => (item ? (item as any)[key] : undefined));
  }

  const matchedItems: any[] = [];
  const indexSelections: number[] = [];

  array.forEach((item, index) => {
    const localScope = createArrayItemScope(scope, item, index);
    const evaluation = evaluateAST(propertyNode, localScope);

    if (typeof evaluation === 'number' && Number.isInteger(evaluation)) {
      indexSelections.push(evaluation);
      return;
    }

    if (Array.isArray(evaluation)) {
      evaluation.forEach(entry => {
        if (typeof entry === 'number' && Number.isInteger(entry)) {
          indexSelections.push(entry);
        }
      });
      return;
    }

    if (evaluation) {
      matchedItems.push(item);
    }
  });

  if (indexSelections.length > 0) {
    const seen = new Set<number>();
    const results: any[] = [];
    indexSelections.forEach(idx => {
      if (!Number.isInteger(idx) || idx < 0 || idx >= array.length) {
        return;
      }
      if (!seen.has(idx)) {
        seen.add(idx);
        results.push(array[idx]);
      }
    });
    return results;
  }

  return matchedItems;
}

function evaluateCall(node: CallNode, scope: Record<string, any>): any {
  const callee = evaluateAST(node.callee, scope);
  if (typeof callee !== 'function') {
    throw new Error('Attempted to call a non-function value');
  }
  const args = node.arguments.map((argument) => evaluateAST(argument, scope));
  return callee(...args);
}

function createArrayItemScope(scope: Record<string, any>, item: any, index: number): Record<string, any> {
  const localScope = Object.create(scope);
  if (item && typeof item === 'object') {
    Object.assign(localScope, toSafeValue(item));
  } else {
    localScope.value = item;
  }
  localScope.$item = item;
  localScope.$index = index;
  return localScope;
}

function toSafeValue(value: any, depth = 0): any {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value !== 'object') {
    return value;
  }

  if (depth > 6) {
    return '[MaxDepth]';
  }

  if (Array.isArray(value)) {
    return value.map(entry => toSafeValue(entry, depth + 1));
  }

  const safeObject = Object.create(null) as Record<string, any>;
  for (const [key, val] of Object.entries(value)) {
    safeObject[key] = toSafeValue(val, depth + 1);
  }
  return safeObject;
}

function isValidIdentifier(key: string): boolean {
  return /^[$A-Z_][0-9A-Z_$]*$/i.test(key);
}

export type ExpressionJSONSchema = {
  type?: string | string[];
  properties?: Record<string, ExpressionJSONSchema>;
  items?: ExpressionJSONSchema;
  anyOf?: ExpressionJSONSchema[];
  additionalProperties?: boolean;
  examples?: any[];
  format?: string;
};

export interface ExpressionValidationDiagnostic {
  message: string;
  path: string;
  keyword?: string;
  schemaPath?: string;
  params?: Record<string, any>;
}

export interface ExpressionEvaluationOptions {
  expectedResultSchema?: ExpressionJSONSchema;
  scopeOverrides?: unknown;
}

export interface ExpressionEvaluationDetails {
  value: any;
  typeHint: ExpressionTypeHint;
  contextSchema: ExpressionJSONSchema;
  diagnostics: ExpressionValidationDiagnostic[];
  valid: boolean;
}

const MAX_SCHEMA_DEPTH = 6;

function buildSchemaForValue(value: any, depth = 0, seen: WeakSet<object> = new WeakSet()): ExpressionJSONSchema {
  if (value === undefined) {
    return { type: ['null'] };
  }

  if (value === null) {
    return { type: 'null' };
  }

  if (value instanceof Date) {
    return { type: 'string', format: 'date-time', examples: [value.toISOString()] } as ExpressionJSONSchema;
  }

  const valueType = typeof value;

  if (valueType === 'string') {
    return { type: 'string', examples: [value] };
  }

  if (valueType === 'number') {
    return { type: 'number', examples: [value] };
  }

  if (valueType === 'boolean') {
    return { type: 'boolean', examples: [value] };
  }

  if (Array.isArray(value)) {
    if (depth >= MAX_SCHEMA_DEPTH || seen.has(value)) {
      return { type: 'array' };
    }
    seen.add(value);
    const itemSchemas = value.slice(0, 5).map(entry => buildSchemaForValue(entry, depth + 1, seen));
    const uniqueSchemas: ExpressionJSONSchema[] = [];
    const schemaKeys = new Set<string>();
    for (const schema of itemSchemas) {
      const key = JSON.stringify(schema);
      if (!schemaKeys.has(key)) {
        schemaKeys.add(key);
        uniqueSchemas.push(schema);
      }
    }
    if (uniqueSchemas.length === 0) {
      return { type: 'array' };
    }
    if (uniqueSchemas.length === 1) {
      return { type: 'array', items: uniqueSchemas[0] };
    }
    return { type: 'array', items: { anyOf: uniqueSchemas } };
  }

  if (valueType === 'object') {
    if (depth >= MAX_SCHEMA_DEPTH || seen.has(value as object)) {
      return { type: 'object', additionalProperties: true };
    }
    seen.add(value as object);
    const properties: Record<string, ExpressionJSONSchema> = {};
    for (const [key, entry] of Object.entries(value as Record<string, any>)) {
      properties[key] = buildSchemaForValue(entry, depth + 1, seen);
    }
    return { type: 'object', properties, additionalProperties: true };
  }

  return {};
}

function buildContextSchema(scope: Record<string, any>): ExpressionJSONSchema {
  const contextShape = {
    trigger: scope.trigger,
    steps: scope.steps ?? scope.nodeOutputs,
    nodeOutputs: scope.nodeOutputs,
    current: scope.current,
    vars: scope.vars,
    workflow: scope.workflow,
    context: scope.context,
  };

  return buildSchemaForValue(contextShape);
}

function resolveTriggerCandidate(context: ExpressionEvaluationInput): any {
  if (context.trigger !== undefined) {
    return context.trigger;
  }

  const rawSteps = context.steps ?? context.nodeOutputs;
  if (rawSteps && typeof rawSteps === 'object') {
    if ((rawSteps as Record<string, any>).trigger !== undefined) {
      return (rawSteps as Record<string, any>).trigger;
    }
    for (const [nodeId, value] of Object.entries(rawSteps as Record<string, any>)) {
      if (nodeId.toLowerCase().startsWith('trigger')) {
        return value;
      }
    }
  }

  return undefined;
}

function mergeVariables(context: ExpressionEvaluationInput): Record<string, any> {
  const merged: Record<string, any> = {};
  const sources = [context.variables, context.vars];
  for (const source of sources) {
    if (!source || typeof source !== 'object') {
      continue;
    }
    for (const [key, value] of Object.entries(source)) {
      merged[key] = value;
    }
  }
  return merged;
}

export class ExpressionEvaluator {
  private readonly cache = new Map<string, (scope: Record<string, any>) => any>();
  private readonly ajv = new Ajv({ allErrors: true, strict: false, allowUnionTypes: true });
  private readonly schemaValidatorCache = new Map<string, ValidateFunction>();

  evaluate(expression: string, context: ExpressionEvaluationInput, options: ExpressionEvaluationOptions = {}): any {
    const result = this.evaluateDetailed(expression, context, options);
    return result.value;
  }

  evaluateDetailed(expression: string, context: ExpressionEvaluationInput, options: ExpressionEvaluationOptions = {}): ExpressionEvaluationDetails {
    if (!expression || typeof expression !== 'string') {
      throw new Error('Expression must be a non-empty string');
    }

    const trimmed = expression.trim();
    if (!trimmed) {
      throw new Error('Expression must contain content');
    }

    let compiled = this.cache.get(trimmed);
    if (!compiled) {
      try {
        compiled = compile(trimmed);
        this.cache.set(trimmed, compiled);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to parse expression';
        throw new Error(`Expression parse error: ${message}`);
      }
    }

    const baseScope = this.createScope(context);
    const scope = this.applyScopeOverrides(baseScope, options.scopeOverrides);

    try {
      const value = compiled(scope);
      const contextSchema = buildContextSchema(scope);
      const diagnostics = options.expectedResultSchema
        ? this.validateAgainstSchema(value, options.expectedResultSchema)
        : [];

      return {
        value,
        typeHint: this.getTypeHint(value),
        contextSchema,
        diagnostics,
        valid: diagnostics.length === 0,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown evaluation error';
      throw new Error(`Expression evaluation error: ${message}`);
    }
  }

  getContextSchema(context: ExpressionEvaluationInput): ExpressionJSONSchema {
    const scope = this.createScope(context);
    return buildContextSchema(scope);
  }

  getTypeHint(value: any): ExpressionTypeHint {
    if (value === null) {
      return 'null';
    }
    if (value === undefined) {
      return 'undefined';
    }
    if (Array.isArray(value)) {
      return 'array';
    }
    if (value instanceof Date) {
      return 'date';
    }
    const valueType = typeof value;
    switch (valueType) {
      case 'string':
        return 'string';
      case 'number':
        return 'number';
      case 'boolean':
        return 'boolean';
      case 'object':
        return 'object';
      default:
        return 'unknown';
    }
  }

  private createScope(context: ExpressionEvaluationInput): Record<string, any> {
    const scope = Object.create(null) as Record<string, any>;

    for (const [key, value] of Object.entries(SAFE_GLOBALS)) {
      scope[key] = value;
    }

    const rawSteps = context.steps ?? context.nodeOutputs ?? {};
    const steps = toSafeValue(rawSteps);
    scope.nodeOutputs = steps;
    scope.outputs = steps;
    scope.steps = steps;

    const trigger = resolveTriggerCandidate(context);
    if (trigger !== undefined) {
      scope.trigger = toSafeValue(trigger);
    }

    scope.current = context.currentNodeId ? steps?.[context.currentNodeId] : undefined;
    scope.workflow = Object.freeze({
      id: context.workflowId,
      executionId: context.executionId,
      userId: context.userId,
    });
    scope.context = Object.freeze({
      workflowId: context.workflowId,
      executionId: context.executionId,
      userId: context.userId,
      currentNodeId: context.currentNodeId,
    });

    const mergedVars = mergeVariables(context);
    if (Object.keys(mergedVars).length > 0) {
      const safeVars = toSafeValue(mergedVars);
      scope.vars = safeVars;
      scope.variables = safeVars;
      for (const [key, value] of Object.entries(safeVars)) {
        if (isValidIdentifier(key)) {
          scope[key] = value;
        }
      }
    }

    return scope;
  }

  private applyScopeOverrides(
    baseScope: Record<string, any>,
    overrides: unknown
  ): Record<string, any> {
    if (overrides === undefined) {
      return baseScope;
    }

    const scope = Object.create(baseScope);

    if (overrides === null) {
      scope.$value = null;
      scope.$ = null;
      scope.value = null;
      return scope;
    }

    if (typeof overrides === 'object') {
      const safeOverrides = toSafeValue(overrides);
      if (safeOverrides && typeof safeOverrides === 'object') {
        Object.assign(scope, safeOverrides);
      }
      scope.$value = safeOverrides;
      scope.$ = safeOverrides;
      scope.value = safeOverrides;
      return scope;
    }

    scope.$value = overrides;
    scope.$ = overrides;
    scope.value = overrides;
    return scope;
  }

  private validateAgainstSchema(value: any, schema: ExpressionJSONSchema): ExpressionValidationDiagnostic[] {
    try {
      const validator = this.getValidator(schema);
      const valid = validator(value);
      if (valid) {
        return [];
      }

      const errors = validator.errors ?? [];
      return errors.map((error: ErrorObject): ExpressionValidationDiagnostic => ({
        message: error.message ?? 'Schema validation failed',
        path: error.instancePath || '',
        keyword: error.keyword,
        schemaPath: error.schemaPath,
        params: error.params as Record<string, any>,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to validate schema';
      return [{ message, path: '' }];
    }
  }

  private getValidator(schema: ExpressionJSONSchema): ValidateFunction {
    const key = JSON.stringify(schema ?? {});
    let validator = this.schemaValidatorCache.get(key);
    if (!validator) {
      const schemaClone = JSON.parse(key);
      validator = this.ajv.compile(schemaClone);
      this.schemaValidatorCache.set(key, validator);
    }
    return validator;
  }
}

export const expressionEvaluator = new ExpressionEvaluator();

export function getExpressionTypeHint(value: any): ExpressionTypeHint {
  return expressionEvaluator.getTypeHint(value);
}

export type ExpressionEvaluationContext = ExpressionEvaluationInput;

export function evaluateContextExpression(
  expression: string,
  context: ExpressionEvaluationContext,
  scopeOverrides?: unknown
): any {
  return expressionEvaluator.evaluate(expression, context, { scopeOverrides });
}

export const SAMPLE_NODE_OUTPUTS = Object.freeze({
  trigger: {
    opportunity: {
      id: 'OPP-001',
      amount: 5000,
      owner: { name: 'Alice Johnson', email: 'alice@example.com' },
      products: [
        { name: 'Premium Support', tier: 'gold', price: 1200 },
        { name: 'Analytics Add-on', tier: 'silver', price: 800 },
      ],
    },
    metadata: {
      receivedAt: '2024-05-20T12:30:00.000Z',
      source: 'Salesforce',
    },
  },
  salesforceCreateOpportunity: {
    id: 'OPP-001',
    stage: 'Prospecting',
    amount: 5000,
    probability: 0.45,
    team: [{ name: 'Alice Johnson' }, { name: 'Marcus Lee' }],
  },
  enrichmentStep: {
    multiplier: 1.2,
    recommendations: [
      { product: 'Premium Support', score: 0.92 },
      { product: 'Analytics Add-on', score: 0.81 },
    ],
    metrics: {
      upsellLikelihood: 0.67,
      churnRisk: 0.18,
    },
  },
  slackNotify: {
    channel: '#sales',
    ts: '1727548200.000200',
    message: 'New opportunity created for Alice Johnson',
    mentions: ['@alice', '@marcus'],
  },
});
