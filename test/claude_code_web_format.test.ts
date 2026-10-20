import { describe, expect, it } from 'vitest';
import { escapeHtml, formatMessageContent } from '../claude-code-web/web_client/src/utils/formatMessage.js';

describe('formatMessageContent', () => {
    it('renders an HTML payload as text', () => {
        const html = formatMessageContent('<img src=x onerror=alert(1)>');
        expect(html).toBe('&lt;img src=x onerror=alert(1)&gt;');
        expect(html).not.toContain('<img');
    });

    it('escapes markup inside code and bold too', () => {
        const html = formatMessageContent('`<script>alert(1)</script>` **<b onmouseover="x()">**');
        expect(html).toBe('<code>&lt;script&gt;alert(1)&lt;/script&gt;</code> <strong>&lt;b onmouseover=&quot;x()&quot;&gt;</strong>');
    });

    it('still formats backtick code, bold and newlines', () => {
        expect(formatMessageContent('run `ls -la`\nthen **stop**')).toBe('run <code>ls -la</code><br>then <strong>stop</strong>');
    });

    it('escapes & exactly once', () => {
        expect(formatMessageContent('a & b')).toBe('a &amp; b');
        expect(formatMessageContent('&amp;')).toBe('&amp;amp;');
    });

    it('returns an empty string for empty input', () => {
        expect(formatMessageContent('')).toBe('');
        expect(formatMessageContent(null)).toBe('');
        expect(formatMessageContent(undefined)).toBe('');
    });
});

describe('escapeHtml', () => {
    it('escapes the five HTML-significant characters', () => {
        expect(escapeHtml(`& < > " '`)).toBe('&amp; &lt; &gt; &quot; &#39;');
    });
});
