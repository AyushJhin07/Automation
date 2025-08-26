/**
 * LLMTemplates - Pre-built prompt templates for common use cases
 * Provides categorized, configurable templates for various AI tasks
 */

export interface LLMTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  prompt: string;
  systemPrompt?: string;
  variables: TemplateVariable[];
  suggestedModels: string[];
  estimatedTokens: number;
  examples: TemplateExample[];
  version: string;
  author?: string;
  createdAt: number;
  updatedAt: number;
}

export interface TemplateVariable {
  name: string;
  type: 'text' | 'number' | 'boolean' | 'select' | 'multiline';
  description: string;
  required: boolean;
  defaultValue?: any;
  options?: string[]; // For select type
  placeholder?: string;
  validation?: {
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    pattern?: string;
  };
}

export interface TemplateExample {
  title: string;
  description: string;
  input: Record<string, any>;
  expectedOutput: string;
}

export interface TemplateCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  order: number;
}

export class LLMTemplateManager {
  private templates = new Map<string, LLMTemplate>();
  private categories = new Map<string, TemplateCategory>();

  constructor() {
    this.initializeBuiltInCategories();
    this.loadBuiltInTemplates();
  }

  /**
   * Get all templates or filter by category/tags
   */
  getTemplates(options?: {
    category?: string;
    tags?: string[];
    search?: string;
  }): LLMTemplate[] {
    let templates = Array.from(this.templates.values());

    if (options?.category) {
      templates = templates.filter(t => t.category === options.category);
    }

    if (options?.tags && options.tags.length > 0) {
      templates = templates.filter(t => 
        options.tags!.some(tag => t.tags.includes(tag))
      );
    }

    if (options?.search) {
      const query = options.search.toLowerCase();
      templates = templates.filter(t =>
        t.name.toLowerCase().includes(query) ||
        t.description.toLowerCase().includes(query) ||
        t.tags.some(tag => tag.toLowerCase().includes(query))
      );
    }

    return templates.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Get template by ID
   */
  getTemplate(id: string): LLMTemplate | undefined {
    return this.templates.get(id);
  }

  /**
   * Add or update a template
   */
  addTemplate(template: LLMTemplate): void {
    template.updatedAt = Date.now();
    if (!template.createdAt) {
      template.createdAt = template.updatedAt;
    }
    
    this.templates.set(template.id, template);
    console.log(`📝 Added LLM template: ${template.name}`);
  }

  /**
   * Render template with variables
   */
  renderTemplate(templateId: string, variables: Record<string, any>): {
    prompt: string;
    systemPrompt?: string;
    errors?: string[];
  } {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }

    const errors: string[] = [];

    // Validate required variables
    for (const variable of template.variables) {
      if (variable.required && (variables[variable.name] === undefined || variables[variable.name] === '')) {
        errors.push(`Missing required variable: ${variable.name}`);
      }
    }

    // Validate variable types and constraints
    for (const variable of template.variables) {
      const value = variables[variable.name];
      if (value !== undefined) {
        const validationError = this.validateVariable(variable, value);
        if (validationError) {
          errors.push(validationError);
        }
      }
    }

    if (errors.length > 0) {
      return { prompt: template.prompt, systemPrompt: template.systemPrompt, errors };
    }

    // Replace variables in prompt
    let prompt = template.prompt;
    let systemPrompt = template.systemPrompt;

    for (const variable of template.variables) {
      const value = variables[variable.name] ?? variable.defaultValue ?? '';
      const placeholder = `{{${variable.name}}}`;
      
      prompt = prompt.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), String(value));
      if (systemPrompt) {
        systemPrompt = systemPrompt.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), String(value));
      }
    }

    return { prompt, systemPrompt };
  }

  /**
   * Get all categories
   */
  getCategories(): TemplateCategory[] {
    return Array.from(this.categories.values()).sort((a, b) => a.order - b.order);
  }

  /**
   * Get popular templates
   */
  getPopularTemplates(limit: number = 10): LLMTemplate[] {
    // TODO: Implement usage tracking
    return this.getTemplates().slice(0, limit);
  }

  /**
   * Create template from existing prompt
   */
  createTemplateFromPrompt(
    prompt: string,
    name: string,
    description: string,
    category: string
  ): LLMTemplate {
    // Extract variables from prompt (look for {{variable}} patterns)
    const variableMatches = prompt.match(/\{\{(\w+)\}\}/g) || [];
    const variableNames = [...new Set(variableMatches.map(match => match.slice(2, -2)))];
    
    const variables: TemplateVariable[] = variableNames.map(name => ({
      name,
      type: 'text',
      description: `Value for ${name}`,
      required: true,
      placeholder: `Enter ${name}...`
    }));

    const template: LLMTemplate = {
      id: `custom_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      name,
      description,
      category,
      tags: ['custom'],
      prompt,
      variables,
      suggestedModels: ['openai:gpt-4o-mini'],
      estimatedTokens: prompt.length / 4, // Rough estimation
      examples: [],
      version: '1.0.0',
      author: 'user',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.addTemplate(template);
    return template;
  }

  private validateVariable(variable: TemplateVariable, value: any): string | null {
    if (!variable.validation) return null;

    const val = variable.validation;
    
    if (variable.type === 'text' || variable.type === 'multiline') {
      const str = String(value);
      if (val.minLength && str.length < val.minLength) {
        return `${variable.name} must be at least ${val.minLength} characters`;
      }
      if (val.maxLength && str.length > val.maxLength) {
        return `${variable.name} must be no more than ${val.maxLength} characters`;
      }
      if (val.pattern && !new RegExp(val.pattern).test(str)) {
        return `${variable.name} format is invalid`;
      }
    }

    if (variable.type === 'number') {
      const num = Number(value);
      if (isNaN(num)) {
        return `${variable.name} must be a number`;
      }
      if (val.min !== undefined && num < val.min) {
        return `${variable.name} must be at least ${val.min}`;
      }
      if (val.max !== undefined && num > val.max) {
        return `${variable.name} must be no more than ${val.max}`;
      }
    }

    return null;
  }

  private initializeBuiltInCategories(): void {
    const categories: TemplateCategory[] = [
      { id: 'content', name: 'Content Creation', description: 'Writing, copywriting, and content generation', icon: '✍️', color: 'blue', order: 1 },
      { id: 'data', name: 'Data Processing', description: 'Data extraction, transformation, and analysis', icon: '📊', color: 'green', order: 2 },
      { id: 'communication', name: 'Communication', description: 'Emails, messages, and correspondence', icon: '💬', color: 'purple', order: 3 },
      { id: 'analysis', name: 'Analysis & Research', description: 'Research, analysis, and insights', icon: '🔍', color: 'yellow', order: 4 },
      { id: 'coding', name: 'Code & Technical', description: 'Programming, debugging, and technical tasks', icon: '💻', color: 'gray', order: 5 },
      { id: 'creative', name: 'Creative', description: 'Creative writing, storytelling, and ideation', icon: '🎨', color: 'pink', order: 6 },
      { id: 'business', name: 'Business', description: 'Business processes, planning, and strategy', icon: '📈', color: 'orange', order: 7 },
      { id: 'education', name: 'Education', description: 'Learning, training, and educational content', icon: '🎓', color: 'indigo', order: 8 }
    ];

    categories.forEach(cat => this.categories.set(cat.id, cat));
  }

  private loadBuiltInTemplates(): void {
    const templates: LLMTemplate[] = [
      // Content Creation
      {
        id: 'blog_post_writer',
        name: 'Blog Post Writer',
        description: 'Generate engaging blog posts on any topic',
        category: 'content',
        tags: ['writing', 'blog', 'content', 'seo'],
        prompt: `Write a comprehensive blog post about {{topic}}.

Target audience: {{audience}}
Tone: {{tone}}
Word count: {{wordCount}} words

Include:
- Compelling headline
- Introduction that hooks the reader
- Well-structured main content with subheadings
- Conclusion with call to action
- SEO-friendly keywords naturally integrated

Make it engaging, informative, and valuable to the reader.`,
        variables: [
          { name: 'topic', type: 'text', description: 'Blog post topic', required: true, placeholder: 'e.g., AI in Healthcare' },
          { name: 'audience', type: 'text', description: 'Target audience', required: true, defaultValue: 'professionals' },
          { name: 'tone', type: 'select', description: 'Writing tone', required: true, options: ['professional', 'casual', 'technical', 'conversational'], defaultValue: 'professional' },
          { name: 'wordCount', type: 'number', description: 'Approximate word count', required: true, defaultValue: 800, validation: { min: 200, max: 3000 } }
        ],
        suggestedModels: ['openai:gpt-4o-mini', 'anthropic:claude-3-5-sonnet'],
        estimatedTokens: 600,
        examples: [{
          title: 'Tech Blog Post',
          description: 'Example blog post about AI',
          input: { topic: 'AI in Healthcare', audience: 'healthcare professionals', tone: 'professional', wordCount: 1000 },
          expectedOutput: 'A comprehensive blog post with proper structure and engaging content...'
        }],
        version: '1.0.0',
        author: 'Apps Script Studio',
        createdAt: Date.now(),
        updatedAt: Date.now()
      },

      // Data Processing
      {
        id: 'data_extractor',
        name: 'Structured Data Extractor',
        description: 'Extract structured data from unstructured text',
        category: 'data',
        tags: ['extraction', 'data', 'json', 'parsing'],
        prompt: `Extract the following information from the text and return it as JSON:

Text to analyze:
{{inputText}}

Extract these fields:
{{fieldsToExtract}}

Return only valid JSON with the extracted data. If a field cannot be found, use null as the value.`,
        systemPrompt: 'You are a data extraction specialist. Return only valid JSON format.',
        variables: [
          { name: 'inputText', type: 'multiline', description: 'Text to extract data from', required: true, placeholder: 'Paste the text content here...' },
          { name: 'fieldsToExtract', type: 'multiline', description: 'Fields to extract (one per line)', required: true, placeholder: 'name\nemail\nphone\ncompany' }
        ],
        suggestedModels: ['openai:gpt-4o-mini', 'anthropic:claude-3-haiku'],
        estimatedTokens: 400,
        examples: [{
          title: 'Contact Information',
          description: 'Extract contact details from email',
          input: { inputText: 'Hi, this is John Smith from Acme Corp. You can reach me at john@acme.com or 555-1234.', fieldsToExtract: 'name\nemail\nphone\ncompany' },
          expectedOutput: '{"name": "John Smith", "email": "john@acme.com", "phone": "555-1234", "company": "Acme Corp"}'
        }],
        version: '1.0.0',
        author: 'Apps Script Studio',
        createdAt: Date.now(),
        updatedAt: Date.now()
      },

      // Communication
      {
        id: 'email_composer',
        name: 'Professional Email Composer',
        description: 'Compose professional emails for any situation',
        category: 'communication',
        tags: ['email', 'communication', 'professional', 'business'],
        prompt: `Compose a professional email with the following details:

Purpose: {{purpose}}
Recipient: {{recipient}}
Tone: {{tone}}
Key points to include:
{{keyPoints}}

Additional context: {{context}}

Write a complete email with appropriate subject line, greeting, body, and closing.`,
        variables: [
          { name: 'purpose', type: 'text', description: 'Purpose of the email', required: true, placeholder: 'e.g., Follow up on meeting' },
          { name: 'recipient', type: 'text', description: 'Recipient description', required: true, placeholder: 'e.g., potential client, colleague' },
          { name: 'tone', type: 'select', description: 'Email tone', required: true, options: ['formal', 'friendly', 'urgent', 'apologetic'], defaultValue: 'friendly' },
          { name: 'keyPoints', type: 'multiline', description: 'Key points to include', required: true, placeholder: 'List main points...' },
          { name: 'context', type: 'multiline', description: 'Additional context', required: false, placeholder: 'Any additional background...' }
        ],
        suggestedModels: ['openai:gpt-4o-mini', 'anthropic:claude-3-5-sonnet'],
        estimatedTokens: 300,
        examples: [{
          title: 'Follow-up Email',
          description: 'Following up after a sales meeting',
          input: { purpose: 'Follow up on sales meeting', recipient: 'potential client', tone: 'friendly', keyPoints: 'Thank for meeting\nNext steps\nProposal timeline' },
          expectedOutput: 'Subject: Thank you for yesterday\'s meeting...'
        }],
        version: '1.0.0',
        author: 'Apps Script Studio',
        createdAt: Date.now(),
        updatedAt: Date.now()
      },

      // Analysis
      {
        id: 'sentiment_analyzer',
        name: 'Text Sentiment Analyzer',
        description: 'Analyze sentiment and emotional tone of text',
        category: 'analysis',
        tags: ['sentiment', 'analysis', 'emotion', 'text'],
        prompt: `Analyze the sentiment and emotional tone of the following text:

"{{textToAnalyze}}"

Provide analysis including:
1. Overall sentiment (positive/negative/neutral) with confidence score
2. Specific emotions detected
3. Key phrases that indicate sentiment
4. Tone assessment (formal/informal, aggressive/passive, etc.)
5. Summary of findings

Be specific and provide reasoning for your analysis.`,
        variables: [
          { name: 'textToAnalyze', type: 'multiline', description: 'Text to analyze', required: true, placeholder: 'Paste the text you want to analyze...' }
        ],
        suggestedModels: ['openai:gpt-4o-mini', 'anthropic:claude-3-5-sonnet'],
        estimatedTokens: 250,
        examples: [{
          title: 'Customer Review',
          description: 'Analyze sentiment of customer feedback',
          input: { textToAnalyze: 'The service was okay but the food was absolutely terrible. Very disappointed.' },
          expectedOutput: 'Overall sentiment: Negative (80% confidence)...'
        }],
        version: '1.0.0',
        author: 'Apps Script Studio',
        createdAt: Date.now(),
        updatedAt: Date.now()
      },

      // Coding
      {
        id: 'code_reviewer',
        name: 'Code Review Assistant',
        description: 'Review code for best practices, bugs, and improvements',
        category: 'coding',
        tags: ['code', 'review', 'programming', 'debugging'],
        prompt: `Review the following {{language}} code and provide feedback:

\`\`\`{{language}}
{{codeToReview}}
\`\`\`

Please analyze for:
1. Code quality and best practices
2. Potential bugs or issues
3. Performance considerations
4. Security concerns
5. Readability and maintainability
6. Suggested improvements

Provide specific, actionable feedback with examples where helpful.`,
        variables: [
          { name: 'language', type: 'select', description: 'Programming language', required: true, options: ['javascript', 'typescript', 'python', 'java', 'go', 'rust', 'other'], defaultValue: 'javascript' },
          { name: 'codeToReview', type: 'multiline', description: 'Code to review', required: true, placeholder: 'Paste your code here...' }
        ],
        suggestedModels: ['openai:gpt-4o-mini', 'anthropic:claude-3-5-sonnet'],
        estimatedTokens: 500,
        examples: [{
          title: 'JavaScript Function Review',
          description: 'Review a JavaScript function for improvements',
          input: { language: 'javascript', codeToReview: 'function add(a, b) { return a + b; }' },
          expectedOutput: 'Code Review Analysis: This is a simple function...'
        }],
        version: '1.0.0',
        author: 'Apps Script Studio',
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    ];

    templates.forEach(template => this.addTemplate(template));
    console.log(`📚 Loaded ${templates.length} built-in LLM templates`);
  }
}

export const llmTemplateManager = new LLMTemplateManager();