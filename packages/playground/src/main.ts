const out = document.getElementById('app')!;

try {
  const res = await fetch('/api/users');
  out.textContent = `${res.status} ${res.statusText}\n\n${await res.text()}`;
} catch (err) {
  out.textContent = String(err);
}
