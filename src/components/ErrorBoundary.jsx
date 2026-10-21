import { Component } from 'react';
import { Footer } from './ui.jsx';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Les détails restent dans la console développeur, jamais exposés à l'écran.
    console.error('[interface] erreur de rendu', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col bg-[#f5f2eb]">
          <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-4 py-16 text-center">
            <div className="cp-card p-8 sm:p-10">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#141210] text-[#eab956] ring-1 ring-[#eab956]/40" aria-hidden="true">
                <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 4h.008M10.3 3.86 1.82 18.5A1.75 1.75 0 003.33 21h17.34a1.75 1.75 0 001.51-2.5L13.7 3.86a1.97 1.97 0 00-3.4 0z" />
                </svg>
              </div>
              <h1 className="mt-5 text-2xl font-extrabold text-[#141210]">Une erreur est survenue</h1>
              <p className="mt-2 max-w-lg text-sm leading-6 text-[#574f45]">
                Cette page n’a pas pu s’afficher. Rechargez-la ; si le problème persiste, contactez notre assistance.
              </p>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="cp-btn cp-btn-primary mt-6"
              >
                Recharger la page
              </button>
            </div>
          </main>
          <Footer />
        </div>
      );
    }
    return this.props.children;
  }
}
