const form = document.getElementById('login-form')
const message = document.getElementById('form-message')
const button = document.getElementById('submit-button')
const signedIn = document.getElementById('signed-in')

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  const apiUrl = window.DEMO_API_URL
  if (!apiUrl || apiUrl.includes('REPLACE-ME')) {
    message.textContent = 'The demo API has not been configured yet.'
    message.className = 'form-message info'
    return
  }

  button.disabled = true
  message.textContent = 'Signing in…'
  message.className = 'form-message info'
  try {
    const response = await fetch(`${apiUrl.replace(/\/$/, '')}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: form.elements.namedItem('email').value.trim(),
        password: form.elements.namedItem('password').value
      })
    })
    if (response.ok) {
      form.hidden = true
      signedIn.hidden = false
      form.reset()
      return
    }
    message.textContent = response.status === 401 ? 'Those details did not match. Try again.' : 'Sign in is unavailable. Please try again.'
    message.className = 'form-message'
  } catch {
    message.textContent = 'Could not reach the demo API. Please try again.'
    message.className = 'form-message'
  } finally {
    button.disabled = false
  }
})

document.getElementById('sign-out').addEventListener('click', () => {
  signedIn.hidden = true
  form.hidden = false
  message.textContent = ''
  document.getElementById('email').focus()
})
