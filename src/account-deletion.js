import { e, modal, errorText } from "./ui.js";
import "./account-deletion.css";

export function openAccountDeletion(repo, email, onClose = () => {}) {
  const dialog = modal(`<h2 id="delete-account-title">계정을 삭제할까요?</h2>
    <p>삭제가 시작되면 취소하거나 복구할 수 없어요.</p>
    <ul class="deletion-details">
      <li>내 프로필, 일기와 임시저장, 댓글, 반응, 알림, 설정, 저장한 서식이 삭제돼요. 내 일기에 달린 친구들의 댓글도 함께 삭제돼요.</li>
      <li>업로드한 사진·스티커·배경·폰트가 삭제돼요. 친구 일기·서식·꾸러미에 쓰인 내 공유 자료도 제거되며, 친구의 글과 사진은 유지돼요.</li>
      <li>모든 기기에서 계정 접근이 차단돼요. 다시 가입하려면 새 초대가 필요해요.</li>
    </ul>
    <form id="delete-account-form">
      <div class="form-field"><label for="delete-account-email">삭제할 계정</label><input id="delete-account-email" type="email" autocomplete="username" value="${e(email)}" readonly></div>
      <div class="form-field"><label for="delete-account-password">현재 비밀번호</label><input id="delete-account-password" name="password" type="password" autocomplete="current-password" required maxlength="4096"></div>
      <div class="form-field"><label for="delete-account-confirmation">확인 문구</label><p class="field-help" id="delete-account-help">아래에 <strong>계정 삭제</strong>를 그대로 입력해주세요.</p><input id="delete-account-confirmation" name="confirmation" autocomplete="off" spellcheck="false" required aria-describedby="delete-account-help"></div>
      <p class="inline-error" id="delete-account-error" role="alert" hidden></p>
      <p id="delete-account-progress" role="status" hidden>계정과 자료를 삭제하고 있어요. 파일 수에 따라 시간이 걸릴 수 있어요.</p>
      <div class="dialog-actions"><button type="button" class="button secondary" id="cancel-account-deletion">취소</button><button type="submit" class="button danger">계정과 기록 영구 삭제</button></div>
    </form>`, "account-deletion-dialog");
  dialog.setAttribute("aria-labelledby", "delete-account-title");
  const form = dialog.querySelector("form");
  const message = dialog.querySelector("#delete-account-error");
  const progress = dialog.querySelector("#delete-account-progress");
  const cancel = dialog.querySelector("#cancel-account-deletion");
  let working = false, attempted = false;
  const close = () => { if (!working) dialog.close(); };
  cancel.onclick = close;
  dialog.querySelector(".modal-close").onclick = close;
  const backdropClick = dialog.onclick;
  dialog.onclick = event => { if (!working) backdropClick(event); };
  dialog.addEventListener("cancel", event => { if (working) event.preventDefault(); });
  dialog.addEventListener("close", () => { form.reset(); if (attempted) onClose(); }, { once: true });
  form.onsubmit = async event => {
    event.preventDefault();
    if (working || !form.reportValidity()) return;
    message.hidden = true;
    if (form.elements.confirmation.value.trim() !== "계정 삭제") {
      message.textContent = "확인 문구에 ‘계정 삭제’를 입력해주세요.";
      message.hidden = false;
      form.elements.confirmation.focus();
      return;
    }
    working = true;
    attempted = true;
    progress.hidden = false;
    form.setAttribute("aria-busy", "true");
    const controls = [...dialog.querySelectorAll("input,button")];
    controls.forEach(control => control.disabled = true);
    try {
      await repo.deleteAccount(form.elements.password.value, "계정 삭제");
      form.reset();
      location.replace(new URL("./index.html?account=deleted", location.href).href);
    } catch (error) {
      form.elements.password.value = "";
      message.textContent = errorText(error);
      message.hidden = false;
      cancel.textContent = "닫기";
    } finally {
      working = false;
      progress.hidden = true;
      form.removeAttribute("aria-busy");
      controls.forEach(control => control.disabled = false);
    }
  };
  cancel.focus();
}
