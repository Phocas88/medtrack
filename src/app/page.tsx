import type { Metadata } from 'next';
import Link from 'next/link';
import LaunchWaitlist from './launch-waitlist';
import './stokora-launch.css';

export const metadata: Metadata = {
  title: 'Stokora WMS | Launching June 2027',
  description: 'Stokora warehouse management. Join the waitlist for our June 2027 launch.',
};

function Wordmark() {
  return (
    <Link className="brand" href="/">
      <span className="mark" aria-hidden="true">S</span>
      Stokora
    </Link>
  );
}

export default function HomePage() {
  return (
    <div className="stokora-launch">
      <div className="banner">
        Stokora launches June 2027 <a href="#waitlist">Get launch updates</a>
      </div>
      <header>
        <nav className="wrap" aria-label="Main navigation">
          <Wordmark />
          <div className="links">
            <a href="#workflow">Workflow</a>
            <a href="#pricing">Pricing</a>
            <a className="button" href="#waitlist">Join the waitlist</a>
          </div>
        </nav>
      </header>
      <main>
        <section className="hero wrap">
          <div>
            <div className="eyebrow">Warehouse management software</div>
            <h1>Know what’s in stock. <em>Keep orders moving.</em></h1>
            <p>Bring receiving, inventory and fulfillment together so your team can follow stock from the inbound dock to the outbound door.</p>
            <a className="button" href="#waitlist">Join the waitlist</a>
          </div>
          <div className="photo" role="img" aria-label="Storage racks in a fulfillment warehouse" />
        </section>
        <section className="flow" id="workflow">
          <div className="wrap">
            <h2>From receiving to shipping</h2>
            <div className="steps">
              <article>
                <h3>Receiving</h3>
                <p>Record incoming stock and see where it belongs.</p>
              </article>
              <article>
                <h3>Inventory</h3>
                <p>Track what’s on hand and where it sits in the warehouse.</p>
              </article>
              <article>
                <h3>Fulfillment</h3>
                <p>Follow orders through picking, packing and shipping.</p>
              </article>
            </div>
          </div>
        </section>
        <section className="pricing wrap" id="pricing">
          <div>
            <div className="eyebrow">Planned pricing</div>
            <h2>Priced by warehouse</h2>
          </div>
          <div>
            <ul>
              <li>A monthly subscription based on the number of warehouse locations.</li>
              <li>Order volume tiers for different fulfillment workloads.</li>
              <li>Team seats included for managers and floor staff.</li>
            </ul>
            <p>Rates will be announced closer to launch.</p>
          </div>
        </section>
        <section className="signup" id="waitlist">
          <div className="wrap">
            <div>
              <div className="eyebrow">June 2027 launch</div>
              <h2>Join the waitlist</h2>
              <p>Get updates about the Stokora launch and pricing.</p>
            </div>
            <LaunchWaitlist />
          </div>
        </section>
      </main>
      <footer className="footer wrap">
        <Wordmark />
        <Link href="/auth/login">Sign in</Link>
        <span>Launching June 2027</span>
      </footer>
    </div>
  );
}
