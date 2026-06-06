// Global test setup: provide a strong JWT secret for the auth library.
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-key-at-least-16-chars-long";
