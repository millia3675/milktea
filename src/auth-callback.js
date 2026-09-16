import "./styles.css";
import { client, configured } from "./repository.js";
import { e, errorText } from "./ui.js";
const root = document.querySelector("#app");
const invalidLinkMessage =
  "이미 사용됐거나 만료된 링크예요. 가입을 마쳤다면 로그인해주세요. 비밀번호를 정하지 못했다면 운영자에게 새 링크를 요청해주세요.";
function authErrorText(error) {
  return ["otp_expired", "otp_disabled"].includes(error?.code)
    ? invalidLinkMessage
    : errorText(error);
}
async function start() {
  try {
    if (!configured)
      throw {
        userMessage: "아직 계정 연결이 끝나지 않았어요. 운영자에게 알려주세요.",
      };
    const url = new URL(location.href);
    const fragment = new URLSearchParams(url.hash.slice(1));
    const callbackError =
      url.searchParams.get("error_description") ||
      fragment.get("error_description");
    if (callbackError)
      throw {
        userMessage: invalidLinkMessage,
      };
    // Opening a shared link must not consume it. Only a valid form submission
    // exchanges the token, so previews and refreshes leave the invitation intact.
    let pending = null;
    if (fragment.has("token_hash")) {
      const type = fragment.get("type");
      const token_hash = fragment.get("token_hash");
      if (!["invite", "recovery"].includes(type) || !/^[a-f0-9]{40,128}$/i.test(token_hash))
        throw { userMessage: "초대 링크가 올바르지 않아요. 전달받은 링크 전체를 다시 열어주세요." };
      pending = { type, token_hash };
    } else {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      if (!data.session)
        throw {
          userMessage:
            "계정 확인 정보가 없어요. 전달받은 초대 링크 전체를 다시 열어주세요. 비밀번호 재설정 메일은 요청한 브라우저에서 열어주세요.",
        };
      history.replaceState(null, "", location.pathname);
    }
    const inviteeEmail = pending ? fragment.get("email")?.trim().toLowerCase() : "";
    root.innerHTML =
      `<main class="login-page"><section class="login-card"><div class="login-brand">밀크티</div><p>일기장에서 사용할 비밀번호를 정해주세요.</p><form id="new-password-form">${inviteeEmail ? `<label for="invitee-email">초대받은 이메일</label><input id="invitee-email" type="email" autocomplete="username" value="${e(inviteeEmail)}" readonly>` : ""}<label for="new-password">새 비밀번호</label><input id="new-password" name="password" type="password" autocomplete="new-password" minlength="12" aria-describedby="password-help" required><p class="field-help" id="password-help">12자 이상으로 입력해주세요.</p><label for="confirm-password">새 비밀번호 확인</label><input id="confirm-password" name="confirmation" type="password" autocomplete="new-password" minlength="12" required><div class="login-error" role="alert"></div><button class="button" type="submit">비밀번호 저장하고 들어가기</button></form><a class="text-button" href="./index.html">이미 가입했다면 로그인</a></section></main>`;
    const form = root.querySelector("form");
    form.onsubmit = async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const message = form.querySelector(".login-error");
      message.textContent = "";
      if (form.elements.password.value !== form.elements.confirmation.value) {
        message.textContent = "두 비밀번호가 일치하지 않아요.";
        return;
      }
      const button = form.querySelector("button");
      button.disabled = true;
      try {
        if (pending) {
          const { data, error } = await client.auth.verifyOtp(pending);
          if (error) throw error;
          if (!data.session) throw { userMessage: invalidLinkMessage };
          if (inviteeEmail && data.user.email?.toLowerCase() !== inviteeEmail)
            throw { userMessage: "초대된 이메일과 링크가 일치하지 않아요. 운영자에게 새 링크를 요청해주세요." };
          pending = null;
          history.replaceState(null, "", location.pathname);
        }
        const { error } = await client.auth.updateUser({
          password: form.elements.password.value,
        });
        if (error) throw error;
        sessionStorage.removeItem("milktea-demo");
        location.replace(new URL("./index.html#/home", location.href).href);
      } catch (error) {
        message.textContent = authErrorText(error);
        button.disabled = false;
      }
    };
  } catch (error) {
    root.innerHTML = `<main class="login-page"><section class="login-card"><div class="login-brand">밀크티</div><h2>계정을 확인하지 못했어요</h2><p>${e(errorText(error))}</p><a class="button" href="./index.html">로그인으로 돌아가기</a></section></main>`;
  }
}
start();
