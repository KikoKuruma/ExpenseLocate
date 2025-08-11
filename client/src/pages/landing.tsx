import { useEffect } from "react";

export default function Landing() {
  useEffect(() => {
    // Redirect directly to login
    window.location.href = '/api/login';
  }, []);

  return (
    <div className="min-h-screen bg-ccw-bg flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 bg-ccw-yellow rounded-lg flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-ccw-dark" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-ccw-dark mb-2">ExpenseLocator</h1>
        <p className="text-gray-600 mb-4">Redirecting to sign in...</p>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ccw-yellow mx-auto"></div>
      </div>
    </div>
  );
}
