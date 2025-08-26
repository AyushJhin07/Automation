/**
 * Retrieval Augmented Generation (RAG) utilities
 * For fetching external content to enhance LLM prompts
 */

/**
 * Fetch content from URLs and create a summarized context
 * Useful for including external information in LLM prompts
 */
export async function fetchAndSummarizeURLs(urls: string[]): Promise<string> {
  if (!urls || urls.length === 0) {
    return '';
  }

  // Limit to 5 URLs to prevent excessive requests
  const limitedUrls = urls.slice(0, 5);
  
  const fetchPromises = limitedUrls.map(async (url) => {
    try {
      console.log(`📥 Fetching content from: ${url}`);
      
      // Set a timeout for the fetch request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Apps Script Studio Workflow Bot/1.0',
          'Accept': 'text/html,application/xhtml+xml,text/plain,*/*'
        }
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const contentType = response.headers.get('content-type') || '';
      
      // Only process text-based content
      if (!contentType.includes('text/') && !contentType.includes('application/json')) {
        return `# ${url}\n[Content type not supported: ${contentType}]`;
      }
      
      const text = await response.text();
      
      // Basic HTML cleaning (remove tags, scripts, styles)
      const cleanText = cleanHtmlContent(text);
      
      // Truncate to prevent overwhelming the context
      const truncated = cleanText.slice(0, 4000);
      const suffix = cleanText.length > 4000 ? '\n[Content truncated...]' : '';
      
      return `# Content from ${url}\n${truncated}${suffix}`;
      
    } catch (error) {
      console.warn(`Failed to fetch ${url}:`, error.message);
      return `# ${url}\n[Failed to fetch: ${error.message}]`;
    }
  });
  
  const results = await Promise.all(fetchPromises);
  return results.join('\n\n');
}

/**
 * Basic HTML content cleaning
 * Removes scripts, styles, and HTML tags while preserving text content
 */
function cleanHtmlContent(html: string): string {
  let cleaned = html;
  
  // Remove script and style elements entirely
  cleaned = cleaned.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  cleaned = cleaned.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  
  // Remove HTML comments
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');
  
  // Remove HTML tags but keep content
  cleaned = cleaned.replace(/<[^>]+>/g, ' ');
  
  // Clean up whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  // Remove excessive line breaks
  cleaned = cleaned.replace(/\n\s*\n\s*\n/g, '\n\n');
  
  return cleaned;
}

/**
 * Extract relevant context from previous workflow node data
 * Formats the data in a way that's useful for LLM processing
 */
export function formatNodeDataForContext(nodeData: any, maxLength: number = 8000): string {
  if (!nodeData) {
    return '';
  }
  
  try {
    let formatted: string;
    
    if (typeof nodeData === 'string') {
      formatted = nodeData;
    } else if (typeof nodeData === 'object') {
      // Pretty print JSON with some intelligent formatting
      formatted = JSON.stringify(nodeData, null, 2);
      
      // If it's an array, provide a summary
      if (Array.isArray(nodeData)) {
        formatted = `Array with ${nodeData.length} items:\n${formatted}`;
      }
    } else {
      formatted = String(nodeData);
    }
    
    // Truncate if too long
    if (formatted.length > maxLength) {
      formatted = formatted.slice(0, maxLength) + '\n[Data truncated...]';
    }
    
    return formatted;
  } catch (error) {
    console.warn('Error formatting node data for context:', error);
    return '[Error formatting previous node data]';
  }
}

/**
 * Check if a URL is safe to fetch
 * Basic validation to prevent fetching from potentially dangerous sources
 */
export function isUrlSafe(url: string): boolean {
  try {
    const parsed = new URL(url);
    
    // Only allow HTTP and HTTPS
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false;
    }
    
    // Prevent localhost and private IP ranges
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === 'localhost' || 
        hostname === '127.0.0.1' || 
        hostname.startsWith('192.168.') ||
        hostname.startsWith('10.') ||
        hostname.startsWith('172.')) {
      return false;
    }
    
    return true;
  } catch {
    return false;
  }
}