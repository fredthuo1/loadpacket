"use client";
import Link from "next/link";
import { Fragment, useEffect, useRef, useState, type FormEvent } from "react";
const samples = {
  van: {
    loadNumber: "LP-2048",
    broker: "Gateway Freight — fictional",
    pickup: "St. Louis, MO",
    delivery: "Memphis, TN",
    rate: "2850.00",
    equipment: "53 ft Dry Van",
  },
  reefer: {
    loadNumber: "LP-3072",
    broker: "Prairie Freight — fictional",
    pickup: "Springfield, MO",
    delivery: "Dallas, TX",
    rate: "3450.00",
    equipment: "53 ft Reefer",
  },
};
type SampleKey = keyof typeof samples;
// Format decimal text without floating-point currency arithmetic.
function formatRate(value: string) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return value;
  const [whole, fraction = ""] = value.split(".");
  return (
    "$" +
    BigInt(whole || "0")
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, ",") +
    "." +
    fraction.padEnd(2, "0")
  );
}
export function SampleRatecon() {
  const [selected, setSelected] = useState<SampleKey>("van");
  const [fields, setFields] = useState({ ...samples.van });
  const [stage, setStage] = useState<"choose" | "review" | "summary">("choose");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const successRef = useRef<HTMLHeadingElement>(null);
  const extractRef = useRef<HTMLButtonElement>(null);
  const interacted = useRef(false);
  function reset(key: SampleKey) {
    interacted.current = true;
    setSelected(key);
    setFields({ ...samples[key] });
    setStage("choose");
    setError("");
    setMessage("Sample selected. Ready to reveal prepared sample details.");
  }
  useEffect(() => {
    if (stage === "review")
      formRef.current?.querySelector("input")?.focus({ preventScroll: true });
    if (stage === "summary") successRef.current?.focus({ preventScroll: true });
    if (stage === "choose" && interacted.current)
      extractRef.current?.focus({ preventScroll: true });
  }, [stage]);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      ![fields.loadNumber, fields.broker, fields.pickup, fields.delivery].every(
        (value) => value.trim(),
      )
    ) {
      setError("Enter a load number, broker, pickup and delivery.");
      return;
    }
    if (!/^\d{1,6}(?:\.\d{1,2})?$/.test(fields.rate)) {
      setError(
        "Enter a rate from $0.01 to $999,999.00 with at most two decimal places.",
      );
      return;
    }
    const [whole, fraction = ""] = fields.rate.split(".");
    const cents = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
    if (cents < BigInt(1) || cents > BigInt(99999900)) {
      setError("Enter a rate from $0.01 to $999,999.00.");
      return;
    }
    setFields((current) => ({
      ...current,
      loadNumber: current.loadNumber.trim(),
      broker: current.broker.trim(),
      pickup: current.pickup.trim(),
      delivery: current.delivery.trim(),
    }));
    setError("");
    setStage("summary");
    setMessage(
      "Sample load created in this demo only. Nothing was saved to your account.",
    );
  }
  return (
    <>
      <section
        className="sample-section"
        id="sample-demo"
        aria-labelledby="sample-title"
      >
        <div className="wrap">
          <div className="sample-heading">
            <div>
              <div className="eyebrow">Take it for a spin</div>
              <h2 id="sample-title">
                One document.
                <br />
                Your next load.
              </h2>
            </div>
            <p>
              Choose a sample RateCon, review the details and create a sample
              load. No sign-in needed.
            </p>
          </div>
          <div className="sample-workspace">
            <div className="sample-toolbar">
              <strong id="sample-progress">
                {stage === "choose"
                  ? "01 / Choose a sample"
                  : stage === "review"
                    ? "02 / Review the details"
                    : "03 / Sample load created"}
              </strong>
              <span>Interactive demo · Fictional data</span>
            </div>
            <div className="sample-grid">
              <div className="sample-source">
                <div
                  className="sample-choices"
                  role="group"
                  aria-label="Choose a sample rate confirmation"
                >
                  <button
                    className="sample-choice"
                    data-sample="van"
                    type="button"
                    aria-pressed={selected === "van"}
                    onClick={() => reset("van")}
                  >
                    Dry van · $2,850
                  </button>
                  <button
                    className="sample-choice"
                    data-sample="reefer"
                    type="button"
                    aria-pressed={selected === "reefer"}
                    onClick={() => reset("reefer")}
                  >
                    Reefer · $3,450
                  </button>
                </div>
                <div className="sample-paper">
                  <div className="paper-sample">
                    FICTIONAL DOCUMENT · DEMO ONLY
                  </div>
                  <div className="paper-heading">Rate Confirmation</div>
                  <dl id="sample-document">
                    {Object.entries({
                      Load: samples[selected].loadNumber,
                      Broker: samples[selected].broker,
                      Pickup: samples[selected].pickup,
                      Delivery: samples[selected].delivery,
                      Equipment: samples[selected].equipment,
                      "Total rate": formatRate(samples[selected].rate),
                    }).map(([label, value]) => (
                      <Fragment key={label}>
                        <dt>{label}</dt>
                        <dd>{value}</dd>
                      </Fragment>
                    ))}
                  </dl>
                </div>
              </div>
              <div className="sample-review">
                <div
                  className="sample-state"
                  id="sample-start"
                  hidden={stage !== "choose"}
                >
                  <div className="sample-start-icon" aria-hidden="true">
                    ↗
                  </div>
                  <h3>Let the document do the talking.</h3>
                  <p>
                    See how a RateCon becomes load details you can review. This
                    demo uses prepared sample fields.
                  </p>
                  <button
                    className="button"
                    id="sample-extract"
                    type="button"
                    onClick={() => {
                      setStage("review");
                      setMessage(
                        "Prepared sample details are ready to review. You can edit the fields.",
                      );
                    }}
                    ref={extractRef}
                  >
                    Extract sample details <span aria-hidden="true">→</span>
                  </button>
                  <p className="sample-helper">
                    Nothing is uploaded or sent to your account.
                  </p>
                </div>
                <form
                  className="sample-state"
                  id="sample-form"
                  hidden={stage !== "review"}
                  onSubmit={submit}
                  ref={formRef}
                >
                  <span className="pill">Ready for your review</span>
                  <h3>Check the details. Make it yours.</h3>
                  <p>Edit a field to try the review step.</p>
                  <div className="sample-fields">
                    <label>
                      Load number
                      <input
                        name="loadNumber"
                        required
                        maxLength={50}
                        value={fields.loadNumber}
                        onChange={(event) => {
                          setFields({
                            ...fields,
                            loadNumber: event.target.value,
                          });
                          setError("");
                        }}
                      />
                    </label>
                    <label>
                      Rate (USD)
                      <input
                        name="rate"
                        type="number"
                        min="0.01"
                        max="999999"
                        step="0.01"
                        required
                        value={fields.rate}
                        onChange={(event) => {
                          setFields({ ...fields, rate: event.target.value });
                          setError("");
                        }}
                      />
                    </label>
                    <label className="full">
                      Broker
                      <input
                        name="broker"
                        required
                        maxLength={150}
                        value={fields.broker}
                        onChange={(event) => {
                          setFields({ ...fields, broker: event.target.value });
                          setError("");
                        }}
                      />
                    </label>
                    <label>
                      Pickup
                      <input
                        name="pickup"
                        required
                        maxLength={120}
                        value={fields.pickup}
                        onChange={(event) => {
                          setFields({ ...fields, pickup: event.target.value });
                          setError("");
                        }}
                      />
                    </label>
                    <label>
                      Delivery
                      <input
                        name="delivery"
                        required
                        maxLength={120}
                        value={fields.delivery}
                        onChange={(event) => {
                          setFields({
                            ...fields,
                            delivery: event.target.value,
                          });
                          setError("");
                        }}
                      />
                    </label>
                  </div>
                  <div className="sample-form-actions">
                    <button className="button" type="submit">
                      Create sample load <span aria-hidden="true">→</span>
                    </button>
                    <button
                      className="sample-reset"
                      type="button"
                      onClick={() => reset(selected)}
                    >
                      Start over
                    </button>
                  </div>
                  {error && <p role="alert">{error}</p>}
                </form>
                <div
                  className="sample-state sample-success"
                  id="sample-success"
                  hidden={stage !== "summary"}
                >
                  <span className="story-check" aria-hidden="true">
                    ✓
                  </span>
                  <h3 tabIndex={-1} id="sample-success-title" ref={successRef}>
                    Your sample load is ready.
                  </h3>
                  <p>
                    You turned a document into a load, with a chance to review
                    every detail.
                  </p>
                  <dl id="sample-result">
                    {Object.entries({
                      Load: fields.loadNumber,
                      Broker: fields.broker,
                      Pickup: fields.pickup,
                      Delivery: fields.delivery,
                      Rate: formatRate(fields.rate),
                    }).map(([label, value]) => (
                      <Fragment key={label}>
                        <dt>{label}</dt>
                        <dd>{value}</dd>
                      </Fragment>
                    ))}
                  </dl>
                  <Link className="button" href="/auth/register">
                    Try it with your operation <span aria-hidden="true">↗</span>
                  </Link>
                  <div>
                    <button
                      className="sample-reset"
                      type="button"
                      onClick={() => reset(selected)}
                    >
                      Try another sample
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div className="sample-notice">
              Illustrative demo only. Prepared sample data, no live document
              extraction. Your edits stay in this page and no load is saved to
              an account.
            </div>
          </div>
          <p id="sample-announcement" className="sr-only" role="status">
            {message}
          </p>
        </div>
      </section>
    </>
  );
}

