/**
 * Content safety and moderation utilities for LLM inputs
 */

/**
 * Moderate input text to check for harmful content
 * Currently returns true (allowing all content) but can be enhanced
 * with actual moderation logic using OpenAI's moderation API
 */
export async function moderateInput(text: string): Promise<boolean> {
  // Basic checks for now - can be enhanced with actual moderation
  if (!text || text.trim().length === 0) {
    return false;
  }
  
  // Check for extremely long inputs that might cause issues
  if (text.length > 100000) {
    console.warn('Input text too long, rejecting');
    return false;
  }
  
  // For now, allow all content
  // TODO: Integrate with OpenAI moderation API or other moderation services
  return true;
}

/**
 * Scrub personally identifiable information from text
 * Basic implementation - can be enhanced with more sophisticated PII detection
 */
export async function scrubPII(text: string): Promise<string> {
  let scrubbed = text;
  
  // Scrub common PII patterns
  // Social Security Numbers
  scrubbed = scrubbed.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '***-**-****');
  scrubbed = scrubbed.replace(/\b\d{9}\b/g, '*********');
  
  // Phone numbers (US format)
  scrubbed = scrubbed.replace(/\b\d{3}-\d{3}-\d{4}\b/g, '***-***-****');
  scrubbed = scrubbed.replace(/\b\(\d{3}\)\s*\d{3}-\d{4}\b/g, '(***)***-****');
  
  // Email addresses (partial scrubbing)
  scrubbed = scrubbed.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '***@***.***');
  
  // Credit card numbers (16 digits)
  scrubbed = scrubbed.replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '****-****-****-****');
  
  return scrubbed;
}

/**
 * Validate that a prompt is safe and appropriate for LLM processing
 */
export async function validatePrompt(prompt: string): Promise<{ valid: boolean; reason?: string }> {
  if (!prompt || prompt.trim().length === 0) {
    return { valid: false, reason: 'Prompt cannot be empty' };
  }
  
  if (prompt.length > 50000) {
    return { valid: false, reason: 'Prompt too long (max 50,000 characters)' };
  }
  
  // Check for potential injection attempts
  const suspiciousPatterns = [
    /ignore\s+previous\s+instructions/i,
    /forget\s+everything/i,
    /system\s*:\s*you\s+are/i,
    /\[SYSTEM\]/i,
    /###\s*SYSTEM/i
  ];
  
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(prompt)) {
      console.warn('Potentially suspicious prompt detected');
      // For now, we'll allow it but log the warning
      // In production, you might want to reject or sanitize
      break;
    }
  }
  
  return { valid: true };
}