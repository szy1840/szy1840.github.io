---
title: "Monetizing AI: Advertising"
date: 2026-07-04
lang: en
ref: ai-ads
---

Original: [Putting Ads in AI](https://a16z.com/putting-ads-in-ai/) (a16z)

"Luxury beliefs," a term that came into vogue a few years ago, are stances taken not really for principled reasons, but for optical reasons. The tech industry is full of them, especially when it comes to advertising. For all the moralistic hand-wringing over "Selling data!" or "Tracking!" or "Attention harvesting" and other bingo words, **the internet has always run on ads and most people like it that way.**

*Whether advertising is ethical is a genuinely interesting question. Set aside the fact that ads pay for the free or nearly-free internet, and consider only the ethics of ads themselves. Advertising does exert influence over attention, but it also sometimes surfaces exactly the thing a person wanted to buy. My sense is that some people assume that, by default, a person works through a complete, enormous catalog of products and only then settles on the best-value brand. In reality, people probably do not spend that much attention or decision cost on every choice. So as long as the ad clears a quality threshold — relevance to what the user cares about and appropriate frequency (so it does not overly interrupt their attention or train of thought), aesthetic quality of the ad itself (giving the user some added value), and user satisfaction (the user judges whether the advertised brand's quality and price meet their expectations, and it may even cut their decision time and cost) — advertising is probably not unethical.*

## Interesting pricing models

**Goal-based bidding.** This is a bit of a fun one, for the fans of auction algorithms (or for former blockchain gas-fee optimizers who want to pivot into LLMs). What if you could set a bounty for a specific query (e.g., $10 for Noe Valley real estate alerts) and have a model throw an outsize amount of compute at a particular outcome? You'd get perfect price discrimination based on the determined "value" of a question, and could also get better guaranteed chain-of-thought reasoning for searches that are particularly important to you.

> In economics, "price discrimination" is not pejorative. It just means charging different prices for the same service according to how much the user or task is willing to pay for it. "What should I make for dinner tonight" is low-value; "find me the right listing to buy" is high-value.

## When to introduce ads

A general rule of thumb in consumer app development: **you need a minimum of 10M weekly active users (WAUs) before introducing ads.**

> **First, ad revenue is usually too small early on.**
> Advertising runs on CPM — how much you make per thousand impressions. Say an app has 1M WAUs and each sees 20 ads a week; that's 20M impressions a week. Sounds like a lot, but at a CPM of just $2–$10 you make roughly tens of thousands to a couple hundred thousand dollars a week, before subtracting fill rate, the platform's cut, ad-system cost, and sales cost. For a consumer startup trying to grow fast, that money may not be worth the hit to the experience.
>
> **Second, ads hurt user experience and growth.**
> What matters most for an early consumer app is retention, word of mouth, share rate, and frequency of use. Ads easily make a product feel "cheap," interrupt the core experience, and lower retention. Especially before the product has formed a strong habit, users don't have much patience.
>
> **Third, advertisers care more about scale and certainty.**
> Big brands and high-quality advertisers are reluctant to negotiate a one-off deal with a small-traffic app. Without enough user scale, you're stuck with low-quality ad networks: low CPMs, poor ad quality, and further damage to the experience. Only at the 10M WAU level are you in a position to do direct sales, brand ads, sponsorships, performance-ad optimization, and so on.
>
> **Fourth, ads need enough data density.**
> Ads make money through targeting. You need to know who the user is, what they like, when they'll click, and which ads convert. When the user base is too small, the data is sparse, the algorithms can't optimize, and ad inventory is unstable.
>
> **Fifth, ads change the product team's incentives.**
> Once ads become a revenue source, the team is easily pushed toward "increase time on site, increase impressions, raise click-through." That often conflicts with "help the user finish the task faster." Before an early product has taken shape, introducing ads pollutes product judgment: it becomes hard to tell whether users genuinely like the product or are just held in place by the design mechanics.

## Other notes

- The two use cases where AI users have already demonstrated a clear willingness to pay are **coding** and **companionship**.
- **The number of people paying for ChatGPT-like products is, in absolute terms, still enormous** — 5–10% of 800M WAUs are paying, which is 40–80M people.
