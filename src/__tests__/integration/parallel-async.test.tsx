import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse, delay } from 'msw';

/**
 * Parallel Async Operations Tests
 * 
 * Vercel best practice: async-parallel
 * Use Promise.all() for independent async operations to avoid waterfalls
 * 
 * These tests verify that independent async operations execute in parallel
 * rather than sequentially, which can cause 2-10× performance improvements.
 */

const server = setupServer();

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('Parallel Async Operations', () => {
  it('should fetch multiple resources in parallel using Promise.all()', 
    async () => {
    server.use(
      http.get('http://localhost/api/user', async () => {
        await delay(100);
        return HttpResponse.json({ id: 1, name: 'Test User' });
      }),
      http.get('http://localhost/api/posts', async () => {
        await delay(100);
        return HttpResponse.json([{ id: 1, title: 'Post 1' }]);
      }),
      http.get('http://localhost/api/comments', async () => {
        await delay(100);
        return HttpResponse.json([{ id: 1, text: 'Comment 1' }]);
      })
    );

    const start = Date.now();
    
    // CORRECT: Use Promise.all() for parallel execution
    const [user, posts, comments] = await Promise.all([
      fetch('http://localhost/api/user').then(r => r.json()),
      fetch('http://localhost/api/posts').then(r => r.json()),
      fetch('http://localhost/api/comments').then(r => r.json())
    ]);
    
    const duration = Date.now() - start;
    
    // Verify data was fetched
    expect(user).toEqual({ id: 1, name: 'Test User' });
    expect(posts).toHaveLength(1);
    expect(comments).toHaveLength(1);
    
    // Should complete in ~100ms (parallel), not ~300ms (sequential)
    // Allow some margin for test environment overhead
    expect(duration).toBeLessThan(200);
  });
});
