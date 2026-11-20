// Animação de entrada — um único momento orquestrado ao carregar a página
gsap.to('#hero-temp, #hero-side', { opacity: 1, y: 0, duration: 0.7, stagger: 0.1, ease: 'power2.out' });
gsap.to('.metric-card', { opacity: 1, y: 0, duration: 0.6, stagger: 0.08, delay: 0.15, ease: 'power2.out' });
gsap.to('#map-card, #map-side', { opacity: 1, y: 0, duration: 0.6, stagger: 0.1, delay: 0.3, ease: 'power2.out' });

// Anima um número do valor antigo pro novo, sem "piscar" a cada leitura do Firebase.
// Exposta em window para ser usada pelo app.js (que é um módulo ES separado).
window.animarValor = function (el, novo, casas = 1) {
  const atual = parseFloat(el.dataset.raw ?? el.textContent) || 0;
  const proxy = { v: atual };
  gsap.to(proxy, {
    v: novo,
    duration: 0.8,
    ease: 'power1.out',
    onUpdate: () => { el.textContent = proxy.v.toFixed(casas); },
  });
  el.dataset.raw = novo;
};
