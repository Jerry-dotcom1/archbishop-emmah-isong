import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = "https://vvvspmrfzlsjdvuoihic.supabase.co";
const supabasePublishableKey = "sb_publishable_aQTAQ5o6kSHmhqFezMMSQw_0b-Vo2AS";
const requestTimeoutMs = 15000;

function fetchWithTimeout(input, init = {}) {
  const controller = new AbortController();
  const requestSignal = init.signal;
  const forwardAbort = () => controller.abort(requestSignal.reason);

  if (requestSignal?.aborted) {
    forwardAbort();
  } else {
    requestSignal?.addEventListener("abort", forwardAbort, { once: true });
  }

  const timeoutId = window.setTimeout(
    () => controller.abort(new Error("Supabase request timed out after 15 seconds.")),
    requestTimeoutMs,
  );

  return fetch(input, { ...init, signal: controller.signal })
    .catch((error) => {
      if (controller.signal.aborted && controller.signal.reason) {
        throw controller.signal.reason;
      }
      throw error;
    })
    .finally(() => {
      window.clearTimeout(timeoutId);
      requestSignal?.removeEventListener("abort", forwardAbort);
    });
}

const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  global: { fetch: fetchWithTimeout },
});
const status = document.getElementById("engagement-status");
const cards = [...document.querySelectorAll(".gallery-card[id], .gallery-video[id]")];
const mediaIds = cards.map((card) => card.id);
const likeCounts = new Map();
const likedMedia = new Set();
const commentsByMedia = new Map();
let visitorId = "";

function showStatus(message) {
  status.textContent = message;
  status.hidden = !message;
}

showStatus("");

function describeError(error) {
  return error?.message || "An unexpected error occurred.";
}

function reportInitializationFailure(error) {
  const message = describeError(error);
  showStatus(`Gallery likes and comments are unavailable: ${message}`);
  panels.forEach((panel) => {
    panel.likeButton.disabled = true;
    panel.likeButton.textContent = "♡ Like unavailable";
    panel.submitButton.disabled = true;
    panel.emptyMessage.hidden = false;
    panel.emptyMessage.textContent = "Comments could not load. Check the connection and reload.";
  });
}

function assertNoError(result) {
  if (result.error) {
    throw result.error;
  }
  return result.data;
}

function createButton(label, className = "engagement-button") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  return button;
}

function renderCommentList(mediaId, list, emptyMessage) {
  list.replaceChildren();
  const savedComments = commentsByMedia.get(mediaId) || [];
  emptyMessage.hidden = savedComments.length > 0;
  emptyMessage.textContent = "No comments yet. Be the first to share a kind word.";

  savedComments.forEach((comment) => {
    const item = document.createElement("li");
    const author = document.createElement("strong");
    const message = document.createElement("span");
    const date = document.createElement("time");

    item.className = "comment-item";
    author.textContent = comment.display_name;
    message.textContent = comment.body;
    date.dateTime = comment.created_at;
    date.textContent = new Date(comment.created_at).toLocaleString();
    date.style.cssText = "display:block;margin-top:4px;color:#bdb8ac;font-size:9px";
    item.append(author, message, date);
    list.append(item);
  });
}

function createEngagementPanel(card) {
  const mediaId = card.id;
  const title =
    card.querySelector(".gallery-card-copy h2")?.textContent ||
    card.querySelector(".video-caption")?.textContent ||
    "this gallery item";
  const panel = document.createElement("section");
  const actions = document.createElement("div");
  const likeButton = createButton("♡ Like · 0");
  const commentButton = createButton("Comment · 0");
  const shareButton = createButton("↗ Share");
  const comments = document.createElement("div");
  const commentList = document.createElement("ul");
  const emptyMessage = document.createElement("p");
  const commentForm = document.createElement("form");
  const nameInput = document.createElement("input");
  const commentInput = document.createElement("textarea");
  const spamTrap = document.createElement("input");
  const submitButton = createButton("Post Comment", "comment-submit");

  panel.className = "engagement";
  actions.className = "engagement-actions";
  comments.className = "engagement-comments";
  comments.hidden = true;
  commentList.className = "comment-list";
  emptyMessage.className = "comment-empty";
  emptyMessage.textContent = "Loading comments...";
  commentForm.className = "comment-form";

  likeButton.setAttribute("aria-label", `Like ${title}`);
  likeButton.setAttribute("aria-pressed", "false");
  commentButton.setAttribute("aria-label", `Show comments for ${title}`);
  commentButton.setAttribute("aria-expanded", "false");
  shareButton.setAttribute("aria-label", `Share ${title}`);
  likeButton.disabled = true;

  nameInput.type = "text";
  nameInput.name = "display_name";
  nameInput.maxLength = 60;
  nameInput.required = true;
  nameInput.autocomplete = "name";
  nameInput.placeholder = "Your display name";
  nameInput.setAttribute("aria-label", "Your display name");

  commentInput.name = "comment";
  commentInput.maxLength = 500;
  commentInput.required = true;
  commentInput.placeholder = "Write a comment (up to 500 characters)";
  commentInput.setAttribute("aria-label", `Comment on ${title}`);

  spamTrap.type = "text";
  spamTrap.name = "website";
  spamTrap.tabIndex = -1;
  spamTrap.autocomplete = "off";
  spamTrap.setAttribute("aria-hidden", "true");
  spamTrap.style.cssText = "position:absolute;left:-10000px;width:1px;height:1px";

  submitButton.type = "submit";
  submitButton.disabled = true;

  function renderLike() {
    const liked = likedMedia.has(mediaId);
    likeButton.textContent = `${liked ? "♥ Liked" : "♡ Like"} · ${likeCounts.get(mediaId) || 0}`;
    likeButton.setAttribute("aria-pressed", String(liked));
  }

  commentButton.addEventListener("click", () => {
    comments.hidden = !comments.hidden;
    commentButton.setAttribute("aria-expanded", String(!comments.hidden));
    if (!comments.hidden) {
      commentInput.focus();
    }
  });

  likeButton.addEventListener("click", async () => {
    const wasLiked = likedMedia.has(mediaId);
    const shouldBeLiked = !wasLiked;
    likeButton.disabled = true;
    likeButton.textContent = wasLiked ? "Removing like..." : "Saving like...";
    showStatus(wasLiked ? "Removing your like…" : "Saving your like…");
    try {
      if (wasLiked) {
        assertNoError(
          await supabase
            .from("gallery_likes")
            .delete()
            .eq("media_id", mediaId)
            .eq("user_id", visitorId),
        );
        likedMedia.delete(mediaId);
      } else {
        assertNoError(
          await supabase.from("gallery_likes").insert({
            media_id: mediaId,
            user_id: visitorId,
          }),
        );
        likedMedia.add(mediaId);
      }

      const currentCount = likeCounts.get(mediaId) || 0;
      likeCounts.set(mediaId, Math.max(0, currentCount + (shouldBeLiked ? 1 : -1)));
      renderLike();

      try {
        await refreshLikeData();
        renderLike();
        showStatus(shouldBeLiked ? "Your like was saved." : "Your like was removed.");
      } catch (error) {
        showStatus(
          `Your like was saved, but the latest total could not be refreshed: ${describeError(error)}`,
        );
      }
    } catch (error) {
      try {
        await refreshLikeData();
        renderLike();
        if (likedMedia.has(mediaId) === shouldBeLiked) {
          showStatus("The like change was saved, but its confirmation was delayed.");
        } else {
          showStatus(`Your like could not be saved: ${describeError(error)}`);
        }
      } catch (refreshError) {
        renderLike();
        showStatus(
          `Your like could not be confirmed: ${describeError(error)}. ` +
            `The current total could not be reloaded: ${describeError(refreshError)}`,
        );
      }
    } finally {
      likeButton.disabled = false;
      renderLike();
    }
  });

  commentForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const displayName = nameInput.value.trim();
    const body = commentInput.value.trim();

    if (!displayName || displayName.length > 60 || !body || body.length > 500) {
      showStatus("Enter a display name (up to 60 characters) and a comment (up to 500 characters).");
      return;
    }
    if (spamTrap.value.trim()) {
      showStatus("The comment was not submitted.");
      return;
    }

    submitButton.disabled = true;
    try {
      assertNoError(
        await supabase.from("gallery_comments").insert({
          media_id: mediaId,
          user_id: visitorId,
          display_name: displayName,
          body,
        }),
      );
      commentForm.reset();
      try {
        await refreshComments();
        renderCommentList(mediaId, commentList, emptyMessage);
        commentButton.textContent = `Comment · ${(commentsByMedia.get(mediaId) || []).length}`;
        showStatus("Your comment was saved and is now visible to visitors.");
      } catch (error) {
        showStatus(
          `Your comment was saved, but the comment list could not be refreshed: ${describeError(error)}`,
        );
      }
    } catch (error) {
      showStatus(`Your comment could not be submitted: ${describeError(error)}`);
    } finally {
      submitButton.disabled = false;
    }
  });

  shareButton.addEventListener("click", async () => {
    const url = new URL(`#${mediaId}`, window.location.href).href;
    try {
      if (navigator.share) {
        await navigator.share({ title, text: `View ${title}`, url });
        showStatus("Gallery item shared.");
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        showStatus("Gallery link copied. You can now share it.");
      } else {
        window.prompt("Copy this gallery link to share:", url);
      }
    } catch (error) {
      if (error.name !== "AbortError") {
        showStatus(`The gallery link could not be shared: ${describeError(error)}`);
      }
    }
  });

  actions.append(likeButton, commentButton, shareButton);
  commentForm.append(nameInput, commentInput, spamTrap, submitButton);
  comments.append(commentList, emptyMessage, commentForm);
  panel.append(actions, comments);

  return {
    panel,
    commentButton,
    commentList,
    emptyMessage,
    likeButton,
    renderLike,
    submitButton,
  };
}

const panels = new Map();
cards.forEach((card) => {
  const panel = createEngagementPanel(card);
  const oldPanel = card.querySelector(".engagement");
  if (oldPanel) {
    oldPanel.replaceWith(panel.panel);
  } else {
    card.append(panel.panel);
  }
  panel.panel.style.visibility = "visible";
  panels.set(card.id, panel);
});

async function refreshLikeData() {
  const [countsResult, likesResult] = await Promise.all([
    supabase.from("gallery_like_counts").select("media_id,like_count"),
    supabase.from("gallery_my_likes").select("media_id"),
  ]);
  const counts = assertNoError(countsResult);
  const likes = assertNoError(likesResult);

  likeCounts.clear();
  counts.forEach((row) => likeCounts.set(row.media_id, Number(row.like_count)));
  likedMedia.clear();
  likes.forEach((row) => likedMedia.add(row.media_id));
}

async function refreshComments() {
  const allComments = [];
  const pageSize = 1000;

  for (let start = 0; ; start += pageSize) {
    const page = assertNoError(
      await supabase
        .from("gallery_comments")
        .select("id,media_id,display_name,body,created_at")
        .in("media_id", mediaIds)
        .order("created_at", { ascending: false })
        .range(start, start + pageSize - 1),
    );
    allComments.push(...page);
    if (page.length < pageSize) {
      break;
    }
  }

  commentsByMedia.clear();
  allComments.forEach((comment) => {
    const comments = commentsByMedia.get(comment.media_id) || [];
    comments.push(comment);
    commentsByMedia.set(comment.media_id, comments);
  });
}

async function initialize() {
  if (!cards.length) {
    throw new Error("No gallery media cards were found.");
  }

  showStatus("Connecting to the gallery...");
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    throw sessionError;
  }

  let session = sessionData.session;
  if (!session) {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) {
      const signInMessage = describeError(error);
      if (/anonymous.*(disabled|not enabled)|signups? (are )?disabled/i.test(signInMessage)) {
        throw new Error(
          "Supabase anonymous sign-ins are disabled. In your Supabase project, open Authentication " +
            "settings, enable Anonymous Sign-Ins, save, and reload this page.",
        );
      }
      throw new Error(`Anonymous sign-in failed: ${signInMessage}`);
    }
    session = data.session;
  }
  if (!session?.user?.id) {
    throw new Error("Supabase did not provide an anonymous visitor identity.");
  }

  visitorId = session.user.id;
  const catalog = assertNoError(
    await supabase.from("gallery_items").select("media_id").in("media_id", mediaIds),
  );
  if (catalog.length !== mediaIds.length) {
    throw new Error("The database gallery item list does not match this page. Run the supplied SQL script.");
  }

  await Promise.all([refreshLikeData(), refreshComments()]);
  panels.forEach((panel, mediaId) => {
    panel.renderLike();
    panel.likeButton.disabled = false;
    panel.submitButton.disabled = false;
    panel.commentButton.textContent = `Comment · ${(commentsByMedia.get(mediaId) || []).length}`;
    renderCommentList(mediaId, panel.commentList, panel.emptyMessage);
  });
  showStatus("");
}

initialize().catch((error) => {
  reportInitializationFailure(error);
});
