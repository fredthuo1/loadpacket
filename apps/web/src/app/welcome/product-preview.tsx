"use client";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
const tourCopies = [
  "A clear route, an assigned driver, and the next step in view.",
  "Keep the load packet together. See what is uploaded and what is missing.",
  "Follow the billing status. This example is waiting for delivery and its POD.",
];
export function ProductPreview() {
  const [tour, setTour] = useState({
    step: 0,
    running: false,
    completed: false,
  });
  const { step, running, completed } = tour;
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  function select(index: number) {
    setTour({ step: index, running: false, completed: false });
  }
  function toggleTour() {
    setTour((current) => ({
      step: current.running
        ? current.step
        : current.completed || current.step === 2
          ? 0
          : current.step,
      running: !current.running,
      completed: false,
    }));
  }
  function onTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % 3
        : event.key === "ArrowLeft"
          ? (index + 2) % 3
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? 2
              : null;
    if (next === null) return;
    event.preventDefault();
    select(next);
    tabs.current[next]?.focus();
  }
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      setTour((current) =>
        !current.running
          ? current
          : current.step === 2
            ? { ...current, running: false, completed: true }
            : { ...current, step: current.step + 1 },
      );
    }, 6000);
    const pauseWhenHidden = () => {
      if (document.hidden)
        setTour((current) => ({ ...current, running: false }));
    };
    document.addEventListener("visibilitychange", pauseWhenHidden);
    pauseWhenHidden();
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", pauseWhenHidden);
    };
  }, [running]);
  return (
    <>
      <section
        className="wrap preview-shell reveal"
        id="see-it"
        aria-label="Interactive product example"
      >
        <div className="preview-label">
          <span>
            <span className="dot"></span>
            ONE LOAD. EVERYTHING CONNECTED.
          </span>
          <a
            href="#sample-demo"
            style={{ textDecoration: "underline", textUnderlineOffset: "4px" }}
          >
            Try a sample RateCon ↗
          </a>
        </div>
        <div className="product">
          <aside className="sidebar" aria-hidden="true">
            <div className="mini-brand">LoadPacket.</div>
            <div className="side-link">Overview</div>
            <div className="side-link active">↗   Loads</div>
            <div className="side-link">Drivers</div>
            <div className="side-link">Documents</div>
            <div className="side-link">Finance</div>
            <div className="side-bottom">
              CARRIER OPERATIONS
              <br />
              Less admin. More clarity.
            </div>
          </aside>
          <div className="product-content">
            <div className="product-top">
              <h2>Your next move, clear.</h2>
              <span className="sample">Illustrative preview</span>
            </div>
            <div
              className="tabs"
              role="tablist"
              aria-label="Explore a sample load"
            >
              <button
                className="tab"
                role="tab"
                id="tab-load"
                aria-controls="panel-load"
                type="button"
                aria-selected={step === 0}
                tabIndex={step === 0 ? 0 : -1}
                onClick={() => select(0)}
                onKeyDown={(event) => onTabKey(event, 0)}
                ref={(node) => {
                  tabs.current[0] = node;
                }}
              >
                The load
              </button>
              <button
                className="tab"
                role="tab"
                id="tab-docs"
                aria-controls="panel-docs"
                type="button"
                aria-selected={step === 1}
                tabIndex={step === 1 ? 0 : -1}
                onClick={() => select(1)}
                onKeyDown={(event) => onTabKey(event, 1)}
                ref={(node) => {
                  tabs.current[1] = node;
                }}
              >
                The paperwork
              </button>
              <button
                className="tab"
                role="tab"
                id="tab-billing"
                aria-controls="panel-billing"
                type="button"
                aria-selected={step === 2}
                tabIndex={step === 2 ? 0 : -1}
                onClick={() => select(2)}
                onKeyDown={(event) => onTabKey(event, 2)}
                ref={(node) => {
                  tabs.current[2] = node;
                }}
              >
                The payment
              </button>
            </div>
            <p className="tour-intro" id="tour-copy" aria-live="polite">
              {tourCopies[step]}
            </p>
            <div
              className="panel"
              id="panel-load"
              role="tabpanel"
              aria-labelledby="tab-load"
              tabIndex={0}
              hidden={step !== 0}
            >
              <div className="load-head">
                <strong>LP–2048</strong>
                <span className="pill amber">In transit</span>
              </div>
              <div className="route">
                <div className="place">
                  <small>Pickup</small>
                  <strong>St. Louis, MO</strong>
                </div>
                <div className="route-line">
                  <svg
                    className="truck"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    aria-hidden="true"
                  >
                    <path d="M2 5h12v12H2zM14 9h4l4 4v4h-8"></path>
                    <circle cx="6" cy="18" r="2" fill="white"></circle>
                    <circle cx="18" cy="18" r="2" fill="white"></circle>
                  </svg>
                </div>
                <div className="place">
                  <small>Delivery</small>
                  <strong>Memphis, TN</strong>
                </div>
              </div>
              <div className="load-meta">
                <div>
                  <small>Driver</small>
                  <strong>Jordan Davis</strong>
                </div>
                <div>
                  <small>Load rate</small>
                  <strong>$2,850.00</strong>
                </div>
                <div>
                  <small>Next step</small>
                  <strong>Delivery &amp; POD</strong>
                </div>
              </div>
            </div>
            <div
              className="panel"
              id="panel-docs"
              role="tabpanel"
              aria-labelledby="tab-docs"
              tabIndex={0}
              hidden={step !== 1}
            >
              <div className="load-head">
                <strong>LP–2048 · Documents</strong>
                <span className="bill-caption">Load packet</span>
              </div>
              <div className="doc-row">
                <span className="file">Rate confirmation.pdf</span>
                <span className="pill">Uploaded</span>
              </div>
              <div className="doc-row">
                <span className="file">Bill of lading.pdf</span>
                <span className="pill">Uploaded</span>
              </div>
              <div className="doc-row">
                <span className="file">Proof of delivery</span>
                <span className="pill amber">Needed after delivery</span>
              </div>
              <p className="bill-caption">
                Know what is on file and what is still needed.
              </p>
            </div>
            <div
              className="panel"
              id="panel-billing"
              role="tabpanel"
              aria-labelledby="tab-billing"
              tabIndex={0}
              hidden={step !== 2}
            >
              <div className="load-head">
                <strong>LP–2048 · Billing</strong>
                <span className="pill amber">Awaiting delivery</span>
              </div>
              <div className="bill-caption" style={{ marginTop: "17px" }}>
                Agreed load rate
              </div>
              <div className="bill-value">$2,850.00</div>
              <div className="load-meta">
                <div>
                  <small>Paperwork</small>
                  <strong>POD still needed</strong>
                </div>
                <div>
                  <small>Invoice</small>
                  <strong>Not issued</strong>
                </div>
                <div>
                  <small>Payment</small>
                  <strong>Not received</strong>
                </div>
              </div>
            </div>
            <div className="demo-footer">
              <button
                className="tour-control"
                id="tour-toggle"
                aria-controls="panel-load panel-docs panel-billing"
                type="button"
                onClick={toggleTour}
                aria-pressed={running}
              >
                {running
                  ? "Ⅱ Pause guided demo"
                  : completed
                    ? "↻ Replay guided demo"
                    : "▷ Play guided demo"}
              </button>
              <span className="tour-status">
                <span className="tour-step" id="tour-step">
                  Step {step + 1} of 3
                </span>
                · Sample data
              </span>
            </div>
            <div className="tour-track" aria-hidden="true">
              <div
                className="tour-progress"
                id="tour-progress"
                style={{ width: `${((step + 1) / 3) * 100}%` }}
              ></div>
            </div>
          </div>
        </div>
        <div className="preview-caption">
          One place for{" "}
          <span>what’s moving, what’s missing, and what’s next.</span>
        </div>
      </section>
    </>
  );
}

