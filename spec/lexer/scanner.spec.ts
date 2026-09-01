import { describe, it, expect } from 'vitest';

import { Scanner } from '#lexer/scanner';

// TESTS //

describe('cl:Scanner', () => {
  describe('constructor', () => {
    it('should initialize scanner with source string', () => {
      const scanner = new Scanner('hello');

      expect(scanner.peek()).toBe('h');
    });

    it('should initialize scanner with empty string', () => {
      const scanner = new Scanner('');

      expect(scanner.isAtEnd()).toBe(true);
    });
  });

  describe('mt:peek', () => {
    it('should return current character without advancing', () => {
      const scanner = new Scanner('abc');

      const first = scanner.peek();
      const second = scanner.peek();

      expect(first).toBe('a');
      expect(second).toBe('a');
    });

    it('should return empty string at end of source', () => {
      const scanner = new Scanner('x');
      scanner.advance();

      const result = scanner.peek();

      expect(result).toBe('');
    });
  });

  describe('mt:peekAhead', () => {
    it('should return character n positions ahead', () => {
      const scanner = new Scanner('abcdef');

      const result = scanner.peekAhead(3);

      expect(result).toBe('d');
    });

    it('should return empty string if n is beyond source length', () => {
      const scanner = new Scanner('abc');

      const result = scanner.peekAhead(10);

      expect(result).toBe('');
    });
  });

  describe('mt:peekN', () => {
    it('should return n characters as string', () => {
      const scanner = new Scanner('abcdef');

      const result = scanner.peekN(3);

      expect(result).toBe('abc');
    });
  });

  describe('mt:advance', () => {
    it('should return current character and advance position', () => {
      const scanner = new Scanner('abc');

      const first = scanner.advance();
      const second = scanner.advance();

      expect(first).toBe('a');
      expect(second).toBe('b');
    });

    it('should return empty string at end of source', () => {
      const scanner = new Scanner('x');
      scanner.advance();

      const result = scanner.advance();

      expect(result).toBe('');
    });

    it('should track line and column on newlines', () => {
      const scanner = new Scanner('a\nb');
      scanner.advance(); // a
      scanner.advance(); // \n

      const pos = scanner.getRange();

      expect(pos).toEqual({ line: 2, column: 1, offset: 2 });
    });
  });

  describe('mt:advanceN', () => {
    it('should return n characters and advance position', () => {
      const scanner = new Scanner('abcdef');

      const result = scanner.advanceN(3);

      expect(result).toBe('abc');
      expect(scanner.peek()).toBe('d');
    });

    it('should return remaining characters if n exceeds available', () => {
      const scanner = new Scanner('abc');

      const result = scanner.advanceN(10);

      expect(result).toBe('abc');
      expect(scanner.isAtEnd()).toBe(true);
    });
  });

  describe('mt:isAtEnd', () => {
    it('should return false at start of non-empty source', () => {
      const scanner = new Scanner('abc');

      const result = scanner.isAtEnd();

      expect(result).toBe(false);
    });

    it('should return true for empty source', () => {
      const scanner = new Scanner('');

      const result = scanner.isAtEnd();

      expect(result).toBe(true);
    });
  });

  describe('mt:match', () => {
    it('should return true if current position matches expected string', () => {
      const scanner = new Scanner('hello world');

      const result = scanner.match('hello');

      expect(result).toBe(true);
    });

    it('should return false if current position does not match', () => {
      const scanner = new Scanner('hello');

      const result = scanner.match('world');

      expect(result).toBe(false);
    });

    it('should return false for partial match', () => {
      const scanner = new Scanner('hel');

      const result = scanner.match('hello');

      expect(result).toBe(false);
    });
  });

  describe('mt:consumeIf', () => {
    it('should consume and return true if matches', () => {
      const scanner = new Scanner('hello world');

      const result = scanner.consumeIf('hello');

      expect(result).toBe(true);
      expect(scanner.peek()).toBe(' ');
    });

    it('should not consume and return false if no match', () => {
      const scanner = new Scanner('hello');

      const result = scanner.consumeIf('world');

      expect(result).toBe(false);
      expect(scanner.peek()).toBe('h');
    });
  });

  describe('mt:getRange', () => {
    it('should return initial position at start', () => {
      const scanner = new Scanner('hello');

      const pos = scanner.getRange();

      expect(pos).toEqual({ line: 1, column: 1, offset: 0 });
    });

    it('should update offset after advance', () => {
      const scanner = new Scanner('hello');
      scanner.advance();
      scanner.advance();

      const pos = scanner.getRange();

      expect(pos).toEqual({ line: 1, column: 3, offset: 2 });
    });
  });

  describe('mt:isAtLineStart', () => {
    it('should return true at start of source', () => {
      const scanner = new Scanner('hello');

      const result = scanner.isAtLineStart();

      expect(result).toBe(true);
    });

    it('should return false after advancing', () => {
      const scanner = new Scanner('hello');
      scanner.advance();

      const result = scanner.isAtLineStart();

      expect(result).toBe(false);
    });

    it('should return true after newline', () => {
      const scanner = new Scanner('a\nb');
      scanner.advance(); // a
      scanner.advance(); // \n

      const result = scanner.isAtLineStart();

      expect(result).toBe(true);
    });
  });

  describe('mt:measureIndent', () => {
    it('should return 0 for no indentation', () => {
      const scanner = new Scanner('hello');

      const result = scanner.measureIndent();

      expect(result).toBe(0);
      expect(scanner.peek()).toBe('h');
    });

    it('should return 1 for 2 spaces', () => {
      const scanner = new Scanner('  hello');

      const result = scanner.measureIndent();

      expect(result).toBe(1);
      expect(scanner.peek()).toBe('h');
    });

    it.each([1, 3, 5])('should reject %i leading spaces', (spaces) => {
      const scanner = new Scanner(`${' '.repeat(spaces)}hello`);

      expect(() => scanner.measureIndent()).toThrow(
        expect.objectContaining({ code: 'MDC_INDENTATION_INVALID' }),
      );
    });

    it.each([
      [0, 0],
      [2, 1],
      [4, 2],
      [6, 3],
    ])('maps %i spaces to level %i', (spaces, level) => {
      const scanner = new Scanner(`${' '.repeat(spaces)}hello`);

      expect(scanner.measureIndent()).toBe(level);
    });

    it('should consume spaces when measuring', () => {
      const scanner = new Scanner('  test');
      scanner.measureIndent();

      const pos = scanner.getRange();

      expect(pos.column).toBe(3);
    });
  });

  describe('mt:consumeUntilNewline', () => {
    it('should consume until newline', () => {
      const scanner = new Scanner('hello world\nnext');

      const result = scanner.consumeUntilNewline();

      expect(result).toBe('hello world');
      expect(scanner.peek()).toBe('\n');
    });

    it('should consume to end if no newline', () => {
      const scanner = new Scanner('hello world');

      const result = scanner.consumeUntilNewline();

      expect(result).toBe('hello world');
      expect(scanner.isAtEnd()).toBe(true);
    });

    it('should return empty string at newline', () => {
      const scanner = new Scanner('\nhello');

      const result = scanner.consumeUntilNewline();

      expect(result).toBe('');
      expect(scanner.peek()).toBe('\n');
    });
  });

  describe('position tracking for MDC syntax', () => {
    it('should track position through directive', () => {
      const source = ['---', 'type: doc', '---'].join('\n');
      const scanner = new Scanner(source);
      scanner.advanceN(4);

      const pos = scanner.getRange();

      expect(pos).toEqual({ line: 2, column: 1, offset: 4 });
    });

    it('should track position through block annotation', () => {
      const source = '{{ ref: intro }}\n# Title';
      const scanner = new Scanner(source);
      scanner.advanceN(17);

      const pos = scanner.getRange();

      expect(pos).toEqual({ line: 2, column: 1, offset: 17 });
    });

    it('should track position through indented content', () => {
      const source = '# Title\n  Indented';
      const scanner = new Scanner(source);
      scanner.advanceN(10);

      const pos = scanner.getRange();

      expect(pos).toEqual({ line: 2, column: 3, offset: 10 });
    });

    it('should track position through inline annotation', () => {
      const source = 'Value is [+12%]{{ trend: positive }}';
      const scanner = new Scanner(source);
      scanner.advanceN(15);

      const pos = scanner.getRange();

      expect(pos).toEqual({ line: 1, column: 16, offset: 15 });
    });
  });

  describe('edge cases', () => {
    it('should handle tab characters', () => {
      const scanner = new Scanner('a\tb');
      scanner.advanceN(2);

      const pos = scanner.getRange();

      expect(pos).toEqual({ line: 1, column: 3, offset: 2 });
    });

    it('should handle unicode characters', () => {
      const scanner = new Scanner('icon: \u{1F4A1}');
      scanner.advanceN(6);

      expect(scanner.isAtEnd()).toBe(false);
    });
  });
});
