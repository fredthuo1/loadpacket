"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import styles from "./welcome.module.css";
import { MarketingHeader } from "./header";
import { HeroStory } from "./hero-story";
import { ProductPreview } from "./product-preview";
import { SampleRatecon } from "./sample-ratecon";

export function Welcome() {
  const [replay, setReplay] = useState(0);
  const [videoError, setVideoError] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let observer: IntersectionObserver | undefined;
    function observe() {
      observer?.disconnect();
      root!.classList.remove("motion-ready");
      if (motion.matches || !("IntersectionObserver" in window)) return;
      observer = new IntersectionObserver(
        (entries) =>
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-visible");
              observer?.unobserve(entry.target);
            }
          }),
        { threshold: 0.08 },
      );
      root!.classList.add("motion-ready");
      root!
        .querySelectorAll(".media-reveal")
        .forEach((element) => observer!.observe(element));
    }
    observe();
    motion.addEventListener("change", observe);
    return () => {
      observer?.disconnect();
      motion.removeEventListener("change", observe);
    };
  }, []);
  function followAnchor(event: MouseEvent<HTMLDivElement>) {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const link = (event.target as Element).closest<HTMLAnchorElement>(
      'a[href^="#"]',
    );
    if (!link) return;
    const target = link.hash
      ? document.getElementById(link.hash.slice(1))
      : rootRef.current;
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "start",
    });
    if (link.classList.contains("skip")) {
      target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
    }
    if (link.classList.contains("watch-film"))
      void videoRef.current?.play().catch(() => {
        /* Native controls remain available if playback is blocked. */
      });
  }
  return (
    <div className={styles.landing} ref={rootRef} onClick={followAnchor}>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <MarketingHeader />
      <main id="main">
        <section className="hero wrap">
          <div className="eyebrow">
            <span className="dot"></span>
            Built for the people behind the haul
          </div>
          <h1>
            From load
            <br />
            {" "}to <span>paid.</span>
          </h1>
          <p>
            Less chasing paperwork. More moving forward.
            <br />
            Keep your loads, drivers and documents in one place.
          </p>
          <div className="hero-actions">
            <Link className="button" href="/auth/register">
              Get started with LoadPacket{" "}
              <span className="arrow" aria-hidden="true">
                ↗
              </span>
            </Link>
            <a className="button secondary watch-film" href="#film">
              <span aria-hidden="true">▷</span>
              Watch the overview <span className="duration">0:20</span>
            </a>
          </div>
          <small className="hero-note">
            Your operation. A little more together.
          </small>
          <HeroStory replay={replay} />
          <button
            className="story-replay"
            id="story-replay"
            aria-controls="hero-story"
            type="button"
            onClick={() => setReplay((value) => value + 1)}
          >
            ↻ Replay the journey
          </button>
        </section>
        <ProductPreview />
        <SampleRatecon />
        <section
          className="film-section wrap media-reveal"
          id="film"
          aria-labelledby="film-title"
        >
          <div className="film-heading">
            <div>
              <div className="eyebrow">A little clarity goes a long way</div>
              <h2 id="film-title">The road ahead. Less admin.</h2>
            </div>
            <p>
              A 20-second look at the workflow.
              <br />
              Press play. Get the picture.
            </p>
          </div>
          <div className="film-frame">
            <video
              ref={videoRef}
              onError={() => setVideoError(true)}
              id="overview-film"
              controls
              playsInline
              preload="none"
              poster="/marketing/loadpacket/road-ahead.webp"
              aria-label="LoadPacket illustrated overview, 20 seconds, no audio"
            >
              <source
                onError={() => setVideoError(true)}
                src="/marketing/loadpacket/loadpacket-overview.mp4"
                type="video/mp4"
              />
              <track
                kind="captions"
                src="/marketing/loadpacket/overview-captions.vtt"
                srcLang="en"
                label="English"
              />
              Your browser does not support embedded video.{" "}
              <a href="/marketing/loadpacket/loadpacket-overview.mp4">
                Watch the overview.
              </a>
            </video>
            {videoError && (
              <p role="alert">
                The overview could not load. You can read the transcript below.
              </p>
            )}
          </div>
          <div className="film-under">
            <span>
              Silent animated overview · Original AI-generated imagery ·
              Illustrates the workflow, not a recording of the app.
            </span>
            <details className="transcript">
              <summary>Read the transcript</summary>
              <p>
                <strong>0:00</strong>
                One load. Every detail. Keep your loads, drivers and documents
                together.
                <br />
                <strong>0:05</strong>
                Start with a RateCon. Upload, review the details, then create
                your load.
                <br />
                <strong>0:10</strong>
                Keep the handoff clear. Assign a driver. Track the paperwork.
                <br />
                <strong>0:15</strong>
                From load to paid. Review billing and keep track of what is
                owed.
              </p>
            </details>
          </div>
        </section>
        <section className="section" id="how-it-works">
          <div className="wrap">
            <div className="section-head">
              <div>
                <div className="eyebrow">A simpler way through</div>
                <h2>
                  Less busywork.
                  <br />
                  More business.
                </h2>
              </div>
              <p>
                From the first document to the final payment, keep the details
                connected.
              </p>
            </div>
            <div className="steps">
              <article className="step media-reveal">
                <span className="number">01 / BRING IT IN</span>
                <h3>Start with your RateCon.</h3>
                <p>
                  Upload a rate confirmation. Review the extracted details
                  before creating your load—or enter it manually.
                </p>
              </article>
              <article className="step media-reveal">
                <span className="number">02 / KEEP IT MOVING</span>
                <h3>Give every load a home.</h3>
                <p>
                  Assign a driver and keep the route, load details and
                  supporting documents together.
                </p>
              </article>
              <article className="step media-reveal">
                <span className="number">03 / CLOSE THE LOOP</span>
                <h3>See the path to payment.</h3>
                <p>
                  Review paperwork, prepare billing and track what is still
                  owed. Fewer loose ends to chase.
                </p>
              </article>
            </div>
          </div>
        </section>
        <section className="section" id="why-loadpacket">
          <div className="wrap quiet-section">
            <div>
              <div className="eyebrow">Built around your day</div>
              <h2>
                You run the operation.
                <br />
                Keep the details here.
              </h2>
              <p>
                For carrier owners and dispatchers who need a clear picture
                without another complicated system.
              </p>
            </div>
            <div>
              <div className="benefit">
                <span className="check" aria-hidden="true">
                  ✓
                </span>
                Load details that stay together
              </div>
              <div className="benefit">
                <span className="check" aria-hidden="true">
                  ✓
                </span>
                Driver assignments you can follow
              </div>
              <div className="benefit">
                <span className="check" aria-hidden="true">
                  ✓
                </span>
                Paperwork gaps you can spot
              </div>
              <div className="benefit">
                <span className="check" aria-hidden="true">
                  ✓
                </span>
                Payments you can keep track of
              </div>
            </div>
          </div>
        </section>
        <section className="section">
          <div className="wrap faq">
            <h2>A few things to know.</h2>
            <details>
              <summary>Do I need a rate confirmation to start?</summary>
              <p>
                No. You can upload a rate confirmation or enter the load
                manually. Both lead into the same load workflow.
              </p>
            </details>
            <details>
              <summary>Will I review the extracted details?</summary>
              <p>
                Yes. Check and correct the extracted information before creating
                the load. You stay in control of the final details.
              </p>
            </details>
            <details>
              <summary>Is the preview showing live company data?</summary>
              <p>
                No. The interactive preview uses fictional sample data to show
                how a load, its documents and billing can stay connected.
              </p>
            </details>
          </div>
        </section>
        <div className="wrap">
          <section className="close">
            <div className="eyebrow">Make room for the road ahead</div>
            <h2>
              Your next load.
              <br />A little less work.
            </h2>
            <Link className="button" href="/auth/register">
              Get started with LoadPacket{" "}
              <span className="arrow" aria-hidden="true">
                ↗
              </span>
            </Link>
            <p>
              Already on board?{" "}
              <Link
                href="/login"
                style={{
                  color: "#fff",
                  textDecoration: "underline",
                  textUnderlineOffset: "4px",
                }}
              >
                Sign in
              </Link>
            </p>
          </section>
        </div>
      </main>
      <footer>
        <div className="wrap footer-row">
          <a className="brand" href="#">
            LoadPacket.
          </a>
          <small>
            © <span id="year">2026</span>{" "}
            LoadPacket. From load to paid.
          </small>
          <div className="footer-links">
            <a href="#how-it-works">How it works</a>
            <Link href="/login">Sign in ↗</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

