import { useState, useEffect, useRef } from 'react';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import css from 'highlight.js/lib/languages/css';
import xml from 'highlight.js/lib/languages/xml';
import sql from 'highlight.js/lib/languages/sql';
import 'highlight.js/styles/github.css';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('shell', bash);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('json', json);
hljs.registerLanguage('css', css);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('sql', sql);

interface CodeBlockProps {
  code: string;
  language?: string;
}

export function CodeBlock({ code, language }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const codeRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (codeRef.current) {
      if (language && hljs.getLanguage(language)) {
        const result = hljs.highlight(code, { language });
        codeRef.current.innerHTML = result.value;
      } else {
        const result = hljs.highlightAuto(code);
        codeRef.current.innerHTML = result.value;
      }
    }
  }, [code, language]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard not available
    }
  };

  return (
    <div className="relative my-3 rounded-lg overflow-hidden border border-[#E9EAEB] bg-[#F9FAFB]">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#F3F4F6] border-b border-[#E9EAEB]">
        <span className="text-xs font-medium text-[#6B7280] uppercase tracking-wide">
          {language || 'code'}
        </span>
        <button
          onClick={handleCopy}
          className="text-xs text-[#6B7280] hover:text-[#111827] transition-colors px-2 py-0.5 rounded hover:bg-[#E9EAEB]"
        >
          {copied ? '✓ Copied!' : 'Copy'}
        </button>
      </div>

      {/* Code */}
      <pre className="overflow-x-auto p-4 text-sm leading-relaxed m-0">
        <code ref={codeRef} className={`language-${language || 'plaintext'}`}>
          {code}
        </code>
      </pre>
    </div>
  );
}
