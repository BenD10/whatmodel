<script>
  import { base } from '$app/paths';
  import '../app.css';

  let { children } = $props();
</script>

<div class="shell">
  <header>
    <div class="brand">
      <img src="{base}/logo.png" alt="" class="logo" />
      <div>
        <h1>
          <span class="what">What</span>
          <span class="model">Model</span><span class="question">?</span>
        </h1>
        <p class="tagline">Find out which AI models your GPU can run.</p>
      </div>
    </div>
  </header>

  <main>
    {@render children()}
  </main>
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
    width: 64px;
    height: 64px;
    object-fit: contain;
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
</style>
