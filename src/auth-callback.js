import "./styles.css";
import { client, configured } from "./repository.js";
import { e, errorText } from "./ui.js";
const root = document.querySelector("#app");
async function start() {
  try {
    if (!configured)
      throw {
        userMessage: "아직 계정 연결이 끝나지 않았어요. 운영자에게 알려주세요.",
      };
    const url = new URL(location.href);
    const callbackError =
      url.searchParams.get("error_description") ||
      new URLSearchParams(url.hash.slice(1)).get("error_description");
    if (callbackError)
      throw {
        userMessage:
          "초대 또는 재설정 링크가 만료되었어요. 새 링크를 받아 다시 열어주세요.",
      };
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    if (!data.session)
      throw {
        userMessage:
          "초대 또는 재설정 링크를 보낸 브라우저에서 다시 열어주세요. 링크가 만료되었다면 새로 받아주세요.",
      };
    history.replaceState(null, "", location.pathname);
    root.innerHTML =
      '<main class="login-page"><section class="login-card"><div class="login-brand">밀크티</div><p>일기장에서 사용할 비밀번호를 정해주세요.</p><form id="new-password-form"><label for="new-password">새 비밀번호</label><input id="new-password" name="password" type="password" autocomplete="new-password" minlength="12" required><label for="confirm-password">새 비밀번호 확인</label><input id="confirm-password" name="confirmation" type="password" autocomplete="new-password" minlength="12" required><div class="login-error" role="alert"></div><button class="button" type="submit">비밀번호 저장하고 들어가기</button></form></section></main>';
    const form = root.querySelector("form");
    form.onsubmit = async (event) => {
      event.preventDefault();
      const message = form.querySelector(".login-error");
      if (form.elements.password.value !== form.elements.confirmation.value) {
        message.textContent = "두 비밀번호가 일치하지 않아요.";
        return;
      }
      const button = form.querySelector("button");
      button.disabled = true;
      try {
        const { error } = await client.auth.updateUser({
          password: form.elements.password.value,
        });
        if (error) throw error;
        sessionStorage.removeItem("milktea-demo");
        location.replace(new URL("./index.html#/home", location.href).href);
      } catch (error) {
        message.textContent = errorText(error);
        button.disabled = false;
      }
    };
  } catch (error) {
    root.innerHTML = `<main class="login-page"><section class="login-card"><div class="login-brand">밀크티</div><h2>계정을 확인하지 못했어요</h2><p>${e(errorText(error))}</p><a class="button" href="./index.html">로그인으로 돌아가기</a></section></main>`;
  }
}
start();
