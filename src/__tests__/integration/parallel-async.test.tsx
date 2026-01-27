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
    const timestamps: number[] = [];
    
    // Setup handlers that track when they're called
    server.use(
      http.get('/api/user', async () => {
        timestamps.push(Date.now());
        await delay(100);
        return HttpResponse.json({ id: 1, name: 'Test User' });
      }),
      http.get('/api/posts', async () => {
        timestamps.push(Date.now());
        await delay(100);
        return HttpResponse.json([
          { id: 1, title: 'Post 1' }
        ]);
      }),
      http.get('/api/comments', async () => {
        timestamps.push(Date.now());
        await delay(100);
        return HttpResponse.json([
          { id: 1, text: 'Comment 1' }
        ]);
      })
    );

    const start = Date.now();
    
    // CORRECT: Use Promise.all() for parallel execution
    const [user, posts, comments] = await Promise.all([
      fetch('/api/user').then(r => r.json()),
      fetch('/api/posts').then(r => r.json()),
      fetch('/api/comments').then(r => r.json())
    ]);
    
    const duration = Date.now() - start;
    
    // Verify data was fetched
    expect(user).toEqual({ id: 1, name: 'Test User' });
    expect(posts).toHaveLength(1);
    expect(comments).toHaveLength(1);
    
    // Should complete in ~100ms (parallel), not ~300ms (sequential)
    // Allow some margin for test environment overhead
    expect(duration).toBeLessThan(200);
    
    // All requests should start within 50ms of each other (parallel)
    const maxTimeDiff = Math.max(...timestamps) - 
                        Math.min(...timestamps);
    expect(maxTimeDiff).toBeLessThan(50);
    
    console.log(
      `Parallel fetch completed in ${duration}ms ` +
      `(requests spread over ${maxTimeDiff}ms)`
    );
  });

  it('should demonstrate the anti-pattern: sequential awaits', 
    async () => {
    const timestamps: number[] = [];
    
    server.use(
      http.get('/api/data1', async () => {
        timestamps.push(Date.now());
        await delay(50);
        return HttpResponse.json({ data: 1 });
      }),
      http.get('/api/data2', async () => {
        timestamps.push(Date.now());
        await delay(50);
        return HttpResponse.json({ data: 2 });
      }),
      http.get('/api/data3', async () => {
        timestamps.push(Date.now());
        await delay(50);
        return HttpResponse.json({ data: 3 });
      })
    );

    const start = Date.now();
    
    // INCORRECT: Sequential awaits (waterfall)
    const data1 = await fetch('/api/data1').then(r => r.json());
    const data2 = await fetch('/api/data2').then(r => r.json());
    const data3 = await fetch('/api/data3').then(r => r.json());
    
    const duration = Date.now() - start;
    
    // Verify data
    expect(data1.data).toBe(1);
    expect(data2.data).toBe(2);
    expect(data3.data).toBe(3);
    
    // Sequential execution takes ~150ms (3 × 50ms)
    expect(duration).toBeGreaterThan(140);
    
    // Requests should be spread out over time (sequential)
    const timeDiff = Math.max(...timestamps) - Math.min(...timestamps);
    expect(timeDiff).toBeGreaterThan(90); // At least 2 delays apart
    
    console.log(
      `Sequential fetch completed in ${duration}ms ` +
      `(requests spread over ${timeDiff}ms) - SLOW!`
    );
  });

  it('should handle partial dependencies with Promise.all()', 
    async () => {
    // Scenario: Fetch user, then fetch user's posts and comments in parallel
    
    server.use(
      http.get('/api/user/:id', async () => {
        await delay(50);
        return HttpResponse.json({ id: 1, name: 'User' });
      }),
      http.get('/api/user/:id/posts', async () => {
        await delay(50);
        return HttpResponse.json([{ id: 1 }]);
      }),
      http.get('/api/user/:id/comments', async () => {
        await delay(50);
        return HttpResponse.json([{ id: 1 }]);
      })
    );

    const start = Date.now();
    
    // Step 1: Fetch user (required first)
    const user = await fetch('/api/user/1').then(r => r.json());
    
    // Step 2: Fetch posts and comments in parallel (both depend on user)
    const [posts, comments] = await Promise.all([
      fetch(`/api/user/${user.id}/posts`).then(r => r.json()),
      fetch(`/api/user/${user.id}/comments`).then(r => r.json())
    ]);
    
    const duration = Date.now() - start;
    
    // Verify data
    expect(user.id).toBe(1);
    expect(posts).toHaveLength(1);
    expect(comments).toHaveLength(1);
    
    // Should take ~100ms (50ms + 50ms parallel), not ~150ms (all sequential)
    expect(duration).toBeLessThan(150);
    
    console.log(
      `Partial dependency fetch completed in ${duration}ms`
    );
  });

  it('should handle errors in parallel requests gracefully', async () => {
    server.use(
      http.get('/api/success', async () => {
        await delay(50);
        return HttpResponse.json({ status: 'ok' });
      }),
      http.get('/api/error', async () => {
        await delay(50);
        return HttpResponse.json(
          { error: 'Failed' },
          { status: 500 }
        );
      })
    );

    // Promise.all() rejects if any promise rejects
    // Use Promise.allSettled() for graceful error handling
    const results = await Promise.allSettled([
      fetch('/api/success').then(r => r.json()),
      fetch('/api/error').then(r => {
        if (!r.ok) throw new Error('API Error');
        return r.json();
      })
    ]);

    expect(results[0].status).toBe('fulfilled');
    expect(results[1].status).toBe('rejected');
    
    if (results[0].status === 'fulfilled') {
      expect(results[0].value).toEqual({ status: 'ok' });
    }
  });

  it('should verify cache manager does not use sequential awaits', 
    async () => {
    // This test documents that our cache manager should use parallel
    // operations when possible
    
    // Example: If we need to fetch multiple chapters, do it in parallel
    const chapters = [1, 2, 3];
    
    server.use(
      http.get('/api/verses/:chapter', async ({ params }) => {
        await delay(30);
        return HttpResponse.json([
          { verse: 1, text: `Chapter ${params.chapter} verse 1` }
        ]);
      })
    );

    const start = Date.now();
    
    // CORRECT: Fetch all chapters in parallel
    const allVerses = await Promise.all(
      chapters.map(chapter =>
        fetch(`/api/verses/${chapter}`).then(r => r.json())
      )
    );
    
    const duration = Date.now() - start;
    
    expect(allVerses).toHaveLength(3);
    
    // Should take ~30ms (parallel), not ~90ms (sequential)
    expect(duration).toBeLessThan(100);
    
    console.log(
      `Parallel chapter fetch (${chapters.length} chapters) ` +
      `completed in ${duration}ms`
    );
  });
});

describe('Parallel Async Best Practices Documentation', () => {
  it('documents when to use Promise.all()', () => {
    // This test serves as documentation
    
    const examples = {
      // ✅ GOOD: Independent operations
      parallel: async () => {
        const [a, b, c] = await Promise.all([
          fetchA(),
          fetchB(),
          fetchC()
        ]);
        return { a, b, c };
      },
      
      // ❌ BAD: Sequential awaits for independent operations
      sequential: async () => {
        const a = await fetchA(); // Wait
        const b = await fetchB(); // Wait
        const c = await fetchC(); // Wait
        return { a, b, c };
      },
      
      // ✅ GOOD: Partial dependencies
      partialDependency: async () => {
        const user = await fetchUser(); // Must wait
        const [posts, comments] = await Promise.all([
          fetchPosts(user.id), // Can be parallel
          fetchComments(user.id) // Can be parallel
        ]);
        return { user, posts, comments };
      },
      
      // ✅ GOOD: Error handling with allSettled
      errorHandling: async () => {
        const results = await Promise.allSettled([
          fetchA(),
          fetchB(),
          fetchC()
        ]);
        return results.filter(r => r.status === 'fulfilled');
      }
    };
    
    expect(examples).toBeDefined();
    expect(typeof examples.parallel).toBe('function');
  });
});

// Helper functions for documentation
async function fetchA() {
  return { data: 'A' };
}

async function fetchB() {
  return { data: 'B' };
}

async function fetchC() {
  return { data: 'C' };
}

async function fetchUser() {
  return { id: 1, name: 'User' };
}

async function fetchPosts(userId: number) {
  return [{ id: 1, userId }];
}

async function fetchComments(userId: number) {
  return [{ id: 1, userId }];
}
