import type { ParameterContext } from '../../shared/nodeGraphSchema.js';

type SafePrimitive = string | number | boolean | null | undefined;

type ExpressionEvaluationInput = Pick<ParameterContext, 'nodeOutputs' | 'currentNodeId' | 'workflowId' | 'executionId' | 'userId'> & {
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

const SAFE_GLOBALS = Object.freeze({
  math: SAFE_MATH,
  number: SAFE_NUMBER,
  string: SAFE_STRING,
  array: SAFE_ARRAY,
  date: SAFE_DATE,
  json: SAFE_JSON,
  bool: SAFE_BOOL,
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
      let numberStr = '';
      let hasDot = false;
      while (position < length) {
        const current = input[position];
        if (current === '.') {
          if (hasDot) {
            break;
          }
          hasDot = true;
          numberStr += current;
          position += 1;
          continue;
        }
        if (!isDigit(current)) {
          break;
        }
        numberStr += current;
        position += 1;
      }
      tokens.push({ type: 'number', value: numberStr, position });
      continue;
    }

    const threeChar = input.slice(position, position + 3);
    if (THREE_CHAR_OPERATORS.has(threeChar)) {
      tokens.push({ type: 'operator', value: threeChar, position });
      position += 3;
      continue;
    }

    const twoChar = input.slice(position, position + 2);
    if (TWO_CHAR_OPERATORS.has(twoChar)) {
      tokens.push({ type: 'operator', value: twoChar, position });
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
      } else if (identifier === 'null') {
        tokens.push({ type: 'null', value: identifier, position });
      } else {
        tokens.push({ type: 'identifier', value: identifier, position });
      }
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
    const expression = this.parseLogicalOr();
    this.expect('eof');
    return expression;
  }

  private parseLogicalOr(): ASTNode {
    let left = this.parseLogicalAnd();
    while (this.matchOperator('||')) {
      const right = this.parseLogicalAnd();
      left = { type: 'LogicalExpression', operator: '||', left, right };
    }
    return left;
  }

  private parseLogicalAnd(): ASTNode {
    let left = this.parseEquality();
    while (this.matchOperator('&&')) {
      const right = this.parseEquality();
      left = { type: 'LogicalExpression', operator: '&&', left, right };
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
      if (this.matchOperator('<')) {
        const right = this.parseAdditive();
        left = { type: 'BinaryExpression', operator: '<', left, right };
        continue;
      }
      if (this.matchOperator('>')) {
        const right = this.parseAdditive();
        left = { type: 'BinaryExpression', operator: '>', left, right };
        continue;
      }
      if (this.matchOperator('<=')) {
        const right = this.parseAdditive();
        left = { type: 'BinaryExpression', operator: '<=', left, right };
        continue;
      }
      if (this.matchOperator('>=')) {
        const right = this.parseAdditive();
        left = { type: 'BinaryExpression', operator: '>=', left, right };
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

  private expect(type: TokenType): void {
    const token = this.tokens[this.index];
    if (!token || token.type !== type) {
      throw new Error(`Unexpected token at position ${token?.position ?? 'end of input'}`);
    }
    this.index += 1;
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

function compile(expression: string): (scope: Record<string, any>) => any {
  const tokens = tokenize(expression);
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

function evaluateCall(node: CallNode, scope: Record<string, any>): any {
  const callee = evaluateAST(node.callee, scope);
  if (typeof callee !== 'function') {
    throw new Error('Attempted to call a non-function value');
  }
  const args = node.arguments.map((argument) => evaluateAST(argument, scope));
  return callee(...args);
}

function toSafeValue(value: any): any {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(toSafeValue);
  }

  const safeObject = Object.create(null) as Record<string, any>;
  for (const [key, val] of Object.entries(value)) {
    safeObject[key] = toSafeValue(val);
  }
  return safeObject;
}

function isValidIdentifier(key: string): boolean {
  return /^[$A-Z_][0-9A-Z_$]*$/i.test(key);
}

export class ExpressionEvaluator {
  private cache = new Map<string, (scope: Record<string, any>) => any>();

  evaluate(expression: string, context: ExpressionEvaluationInput): any {
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

    const scope = this.createScope(context);

    try {
      return compiled(scope);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown evaluation error';
      throw new Error(`Expression evaluation error: ${message}`);
    }
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

    scope.nodeOutputs = toSafeValue(context.nodeOutputs ?? {});
    scope.outputs = scope.nodeOutputs;
    scope.current = context.currentNodeId ? scope.nodeOutputs?.[context.currentNodeId] : undefined;
    scope.context = Object.freeze({
      workflowId: context.workflowId,
      executionId: context.executionId,
      userId: context.userId,
      currentNodeId: context.currentNodeId,
    });

    if (context.vars) {
      for (const [key, value] of Object.entries(context.vars)) {
        if (isValidIdentifier(key)) {
          scope[key] = toSafeValue(value);
        }
      }
    }

    return scope;
  }
}

export const expressionEvaluator = new ExpressionEvaluator();

export function getExpressionTypeHint(value: any): ExpressionTypeHint {
  return expressionEvaluator.getTypeHint(value);
}

export type ExpressionEvaluationContext = ExpressionEvaluationInput;

export const SAMPLE_NODE_OUTPUTS = Object.freeze({
  trigger: {
    email: {
      subject: 'Quarterly Revenue Report',
      from: 'finance@example.com',
      to: ['leadership@example.com'],
      body: 'Revenue increased by 18% compared to last quarter.',
    },
    metadata: {
      receivedAt: '2024-05-20T12:30:00.000Z',
      attachments: 2,
    },
  },
  transform: {
    summary: 'Revenue up 18%',
    highlightedMetrics: ['revenue', 'growth'],
    growthRate: 0.18,
    totals: {
      revenue: 1284000,
      expenses: 934000,
    },
  },
  analytics: {
    totalRevenue: 1284000,
    expenses: 934000,
    profit: 350000,
    profitMargin: 0.272,
    lastSync: '2024-05-19T16:45:00.000Z',
  },
});
