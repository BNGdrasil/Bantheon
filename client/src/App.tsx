function App() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      backgroundColor: '#0f172a',
      color: '#f1f5f9',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      padding: '20px',
    }}>
      <div style={{
        maxWidth: '800px',
        textAlign: 'center',
      }}>
        <h1 style={{
          fontSize: '4rem',
          fontWeight: 'bold',
          marginBottom: '1rem',
          background: 'linear-gradient(to right, #3b82f6, #8b5cf6)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}>
          Hello, World!
        </h1>
        
        <p style={{
          fontSize: '1.5rem',
          marginBottom: '2rem',
          color: '#94a3b8',
        }}>
          Welcome to BNGdrasil
        </p>
        
        <div style={{
          display: 'flex',
          gap: '1rem',
          justifyContent: 'center',
          flexWrap: 'wrap',
        }}>
          <a
            href="https://admin.bnbong.xyz"
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#3b82f6',
              color: 'white',
              textDecoration: 'none',
              borderRadius: '0.5rem',
              fontWeight: '600',
              transition: 'background-color 0.2s',
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#3b82f6'}
          >
            Admin Dashboard
          </a>
          
          <a
            href="https://monitoring.bnbong.xyz"
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#8b5cf6',
              color: 'white',
              textDecoration: 'none',
              borderRadius: '0.5rem',
              fontWeight: '600',
              transition: 'background-color 0.2s',
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#7c3aed'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#8b5cf6'}
          >
            Monitoring
          </a>
          
          <a
            href="https://api.bnbong.xyz/docs"
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#10b981',
              color: 'white',
              textDecoration: 'none',
              borderRadius: '0.5rem',
              fontWeight: '600',
              transition: 'background-color 0.2s',
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#059669'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#10b981'}
          >
            API Docs
          </a>
        </div>
        
        <div style={{
          marginTop: '3rem',
          padding: '1.5rem',
          backgroundColor: '#1e293b',
          borderRadius: '0.75rem',
          border: '1px solid #334155',
        }}>
          <h2 style={{
            fontSize: '1.25rem',
            fontWeight: '600',
            marginBottom: '1rem',
          }}>
            🚀 BNGdrasil Infrastructure
          </h2>
          <p style={{
            color: '#94a3b8',
            fontSize: '0.95rem',
            lineHeight: '1.6',
          }}>
            A multi-region, microservices-based cloud infrastructure built on Oracle Cloud Infrastructure (OCI).
            <br />
            Powered by FastAPI, React, and modern DevOps practices.
          </p>
        </div>
        
        <footer style={{
          marginTop: '3rem',
          color: '#64748b',
          fontSize: '0.875rem',
        }}>
          © 2025 bnbong. All rights reserved.
        </footer>
      </div>
    </div>
  );
}

export default App;
