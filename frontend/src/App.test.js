import { render, screen } from '@testing-library/react';
import App from './App';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';

test('renders the hospital portal heading', () => {
  render(
    <BrowserRouter>
      <App />
    </BrowserRouter>
  );

  const heading = screen.getByText(/Hospital Care Portal/i);
  expect(heading).toBeInTheDocument();
});

test('renders a helpful not-found page for unknown routes', () => {
  render(
    <MemoryRouter initialEntries={['/unknown-route']}>
      <App />
    </MemoryRouter>
  );

  expect(screen.getByText('Page not found')).toBeInTheDocument();
  expect(screen.getByText(/does not exist or may have moved/i)).toBeInTheDocument();
});
