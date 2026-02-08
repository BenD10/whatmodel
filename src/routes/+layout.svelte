<script>
  import { base } from '$app/paths';
  import '../app.css';

  let { children } = $props();
</script>

<div class="shell">
  <header>
    <div class="brand">
      <img src="{base}/logo.png" alt="What Models? logo" class="logo" />
      <div>
        <h1>
          <span class="what">What</span>
          <span class="model">Models</span><span class="question">?</span>
        </h1>
        <p class="tagline">Pick the right model for your GPU — in seconds.</p>
      </div>
    </div>
  </header>

  <main>
    {@render children()}
  </main>

  <footer>
    <p>
      Data last updated February 2026.
      <a href="https://github.com/BenD10/whatmodels" target="_blank" rel="noopener">&#9829; GitHub</a> ·
      <a href="https://github.com/BenD10/whatmodels/issues" target="_blank" rel="noopener">Report an issue</a>
    </p>
  </footer>
</div>

<style>
  .shell {
    max-width: 720px;
    margin: 0 auto;
    padding: 2.5rem 1.5rem 4rem;
  }

  header {
    margin-bottom: 2.5rem;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .logo {
    width: 96px;
    height: 96px;
    object-fit: contain;
    border-radius: 12px;
    filter: drop-shadow(0 0 14px rgba(107, 138, 255, 0.45));
  }

  h1 {
    font-size: 1.85rem;
    font-weight: 800;
    letter-spacing: -0.03em;
    line-height: 1.1;
  }

  .what {
    color: var(--text);
  }

  .model {
    background: linear-gradient(135deg, #6b8aff 0%, #4fc3f7 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .question {
    color: #4fc3f7;
  }

  .tagline {
    color: var(--text-muted);
    margin-top: 0.2rem;
    font-size: 0.95rem;
  }

  footer {
    margin-top: 3rem;
    border-top: 1px solid var(--border);
    padding-top: 1.5rem;
    text-align: center;
    color: var(--text-muted);
    font-size: 0.8rem;
  }

  footer a {
    color: var(--accent);
    text-decoration: none;
    transition: opacity 0.15s;
  }

  footer a:hover {
    opacity: 0.8;
    text-decoration: underline;
  }

  @media (max-width: 600px) {
    .shell {
      padding: 1.5rem 1rem 3rem;
    }

    .logo {
      width: 72px;
      height: 72px;
    }

    h1 {
      font-size: 1.45rem;
    }

    .tagline {
      font-size: 0.85rem;
    }
  }
</style>
