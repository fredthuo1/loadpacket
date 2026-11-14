"use client";
export function HeroStory({ replay }: { replay: number }) {
  return (
    <>
      <div
        className="hero-story is-playing"
        id="hero-story"
        aria-label="Illustrative journey from rate confirmation to invoice-ready load"
        key={replay}
      >
        <div className="story-card story-left">
          <div className="story-kicker">01 / BRING IT IN</div>
          <div className="story-stage">
            <div className="story-document">
              <svg viewBox="0 0 40 48" fill="none" aria-hidden="true">
                <path
                  d="M7 3h18l9 10v32H7zM25 3v11h9M13 23h15M13 29h15M13 35h9"
                  stroke="currentColor"
                  strokeWidth="2"
                ></path>
              </svg>
              <strong>Rate confirmation</strong>
              <span>LP–2048 · Sample document</span>
              <div className="paper-lines">
                <i></i>
                <i></i>
                <i></i>
              </div>
            </div>
            <div className="story-load">
              <span className="story-check">✓</span>
              <strong>Load details, ready.</strong>
              <span>St. Louis → Memphis</span>
              <b>$2,850.00</b>
            </div>
          </div>
          <div className="story-caption">A document becomes a load.</div>
        </div>
        <div className="story-card story-right">
          <div className="story-kicker">02 / KEEP IT MOVING</div>
          <svg
            className="story-map"
            viewBox="0 0 220 100"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M7 68C50 68 35 20 88 24S139 90 210 33"
              stroke="#c7d6ce"
              strokeWidth="2"
              strokeDasharray="4 5"
            ></path>
            <path
              className="story-route"
              d="M7 68C50 68 35 20 88 24S139 90 210 33"
              stroke="#12645e"
              strokeWidth="2.5"
            ></path>
            <circle cx="7" cy="68" r="5" fill="#12645e"></circle>
            <circle cx="210" cy="33" r="5" fill="#12645e"></circle>
            <g className="moving-truck">
              <rect
                x="-14"
                y="-10"
                width="19"
                height="16"
                rx="2"
                fill="white"
                stroke="#12645e"
                strokeWidth="2"
              ></rect>
              <path
                d="M5-5h7l6 6v5H5z"
                fill="#d9eee4"
                stroke="#12645e"
                strokeWidth="2"
              ></path>
              <circle cx="-7" cy="8" r="3" fill="#12645e"></circle>
              <circle cx="12" cy="8" r="3" fill="#12645e"></circle>
            </g>
          </svg>
          <div className="story-status status-pod">
            <span>✓</span>
            POD received
          </div>
          <div className="story-status status-invoice">
            <span>✓</span>
            Ready to invoice
          </div>
          <div className="story-caption">Fewer loose ends.</div>
        </div>
      </div>
    </>
  );
}

