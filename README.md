# 밀크티

친구들과 쓰는 비공개 교환일기. 승인된 화면설계를 바탕으로 HTML/CSS/JavaScript와 Supabase 연결 코드를 구현했습니다.

## 현재 상태

- 달력, 개인 일기장, 월/태그 모아보기, 일기 작성/수정/삭제.
- 본문 중간 사진, 블록 순서 변경, 텍스트/사진 댓글과 반응.
- 본인 연참 Weekly/Monthly, 생활 기록 항목, 자동 임시저장.
- 프로필 사진 자르기, 닉네임, 개인 색상.
- 종이 배경, PNG/WebP 스티커 등록·드래그·회전·크기·순서, 사용자 폰트.
- 모바일 메뉴, 사진 확대, 키보드 스티커 이동, 데이터 접근 RLS.

**Supabase 프로젝트는 아직 연결되지 않았습니다.** 지금 사용할 수 있는 체험 공간은 이 브라우저의 IndexedDB에만 저장합니다. 새 브라우저나 다른 기기에서는 별개이며 실제 친구와 공유되지 않습니다. 실제 모임은 아래 연결을 완료한 뒤 사용할 수 있습니다. 체험 데이터는 실제 모임에 자동으로 복사되지 않습니다.

## 실행과 빌드

Node.js 24 LTS 환경을 사용합니다.

```sh
npm ci
npm run dev
```

개발 주소는 `http://127.0.0.1:5173/`입니다. 첫 화면에서 ‘체험 일기장 열기’를 선택합니다. `?demo=1`로 접속하면 해당 탭에서 체험 모드가 바로 열립니다.

```sh
npm test
npm run build
npm run preview
```

`dist/`가 배포 결과입니다. ES Modules와 브라우저 저장 기능을 사용하므로 HTML 파일을 더블클릭하는 방식 대신 HTTP 서버나 GitHub Pages로 열어주세요. 로컬 개발 도구는 127.0.0.1에만 바인딩합니다.

## Supabase 연결

1. 새 프로젝트를 만들고 `supabase/migrations/202609140001_initial.sql` 전체를 SQL Editor에서 postgres 권한으로 한 번 실행합니다. 기존 데이터베이스를 덮어쓰는 스크립트가 아닙니다.
2. Auth 일반 설정에서 신규 회원가입과 anonymous sign-in을 비활성화합니다.
3. `public/config.js`의 supabaseUrl과 publishableKey를 채웁니다. 또는 `.env.example`을 `.env.local`로 복사해 같은 두 값을 설정합니다.
4. Auth URL Configuration의 Site URL을 배포한 사이트 루트로 지정합니다. Redirect URLs에 배포 사이트의 `auth-callback.html` 주소를 추가합니다. 프로젝트 사이트는 `/milktea-diary/` 경로를 포함합니다.
5. Auth Users에서 본인과 친구 계정을 생성/초대합니다. 받은 UUID를 `members`에 추가하면 프로필과 기본 설정이 자동으로 만들어집니다.
6. 체험 모드에서 나간 뒤 실제 이메일·비밀번호로 로그인합니다. 두 실제 계정에서 일기·댓글·사진 공유와 타인 글 수정 거부를 확인합니다.

```js
window.MILKTEA_CONFIG = {
  supabaseUrl: 'https://YOUR-PROJECT.supabase.co',
  publishableKey: 'sb_publishable_...'
};
```

브라우저에 넣을 수 있는 키는 publishable key 또는 기존 anon key뿐입니다. secret key와 service_role key는 넣지 않습니다. 앱도 해당 종류의 키를 거부하도록 구현했습니다. DB 비밀번호도 앱에 필요하지 않습니다.

```sql
-- Auth에 실제 계정을 만든 뒤, 실제 UUID로 바꿔 운영자 SQL Editor에서 실행합니다.
insert into public.members(id) values ('00000000-0000-4000-8000-000000000001');
update public.profiles set nickname='내 닉네임'
where id='00000000-0000-4000-8000-000000000001';
```

회원 접근을 중지할 때는 members.active=false로 설정합니다. 기존 글을 보존하며 이후 DB/Storage 접근을 차단합니다. 회원 완전 삭제와 파일 정리는 별도 운영 절차입니다.

## GitHub Pages

제공한 `.github/workflows/pages.yml`은 main에 push할 때 테스트·빌드한 뒤 Pages에 배포합니다. 저장소의 Settings → Pages → Source를 GitHub Actions로 지정합니다. Vite base를 상대 경로로 설정하여 프로젝트 사이트의 하위 경로를 지원합니다.

`public/config.js` 변경 뒤 push하면 연결 설정도 배포됩니다. 공개할 수 있는 URL과 publishable key만 넣으므로 빌드 결과에 포함됩니다. 로그인 화면과 앱 코드는 공개되어도, 일기와 private 버킷 파일은 승인된 사용자만 읽도록 DB에서 검사합니다.

## 데이터와 권한

실제 서비스는 Supabase Auth·PostgreSQL·private Storage를 사용합니다. SQL의 members 목록에 승인된 계정만 데이터에 접근합니다. 본문·스티커·생활 기록은 일기 문서로 함께 저장하고, 파일 참조는 entry_assets 외래키로 보호합니다. save_entry RPC와 version으로 편집 충돌을 감지합니다.

임시저장·개인 설정·읽음 기록·미사용 업로드 파일은 본인만 읽습니다. 게시 글·댓글·프로필에서 사용하는 파일은 승인된 친구도 인증된 다운로드로 읽습니다. 일기 주인은 타인의 댓글을 삭제할 수 있으나 수정은 할 수 없습니다.

사진은 브라우저에서 재인코딩 후 업로드합니다. 폰트는 확장자·크기·시그니처와 브라우저 로딩을 확인합니다. 입력된 본문은 HTML로 실행하지 않고 텍스트로 표시합니다. 미디어 자체에 대한 별도 서버 바이러스 검사는 포함하지 않습니다.

Storage 업로드와 DB 저장은 하나의 트랜잭션이 아닙니다. 저장 실패 시 업로드된 미사용 파일이 남을 수 있습니다. 라이브러리에서는 ‘숨기기’를 제공하며, 참조 중인 실제 파일을 삭제하지 않습니다. 고아 파일 자동 정리와 파일 바이트 재검증용 서버는 후속 작업입니다.

## 구현 범위와 운영 전 확인

- 실제 Supabase 프로젝트·계정이 준비되지 않아, 원격 Auth 메일 수신·원격 Storage·서로 다른 실제 사용자 간 동기화는 연결 후 확인해야 합니다.
- 새 글은 페이지 이동·새로고침 때 반영됩니다. 실시간 구독·푸시 알림·새 댓글 알림은 포함하지 않습니다.
- 본인 연참 숫자는 UI에서만 표시되지만, 친구가 게시 날짜를 세어 연속 작성일을 추측하는 것까지 막을 수는 없습니다.
- 일반 체험 데이터와 실제 계정 데이터는 분리됩니다. 서비스 모드에서는 브라우저 저장을 공용 데이터베이스처럼 쓰지 않습니다.
- 오래된 글의 편집 자동 저장은 하지 않습니다. 새 초안에만 자동 임시저장을 적용하며 게시 글의 수정은 ‘수정 저장’으로 반영합니다.
- 그룹을 여러 개 만들거나 특정 친구에게만 게시하는 기능, 휴지통, 고급 전체 검색은 포함하지 않습니다.

## 파일 안내

```text
src/main.js          로그인·화면 이동·공통 메뉴
src/pages.js         달력·개인 일기장·모아보기·연참
src/articles.js      일기 카드·댓글·반응·미디어 표시
src/editor.js        블록 작성·자동 임시저장·스티커 배치
src/settings.js      프로필·테마·생활 기록·파일 라이브러리
src/repository.js    Supabase 연결과 별도 체험 저장소
src/media.js         이미지 처리·폰트 검사·파일 등록
src/dates.js         한국 날짜와 연참 계산
src/auth-callback.js 초대/비밀번호 재설정 복귀
public/setup.html    사용자용 연결 안내
supabase/migrations/ 데이터베이스 초기화 SQL
tests/              날짜·연참 단위 검증
```

공식 참고: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Auth 설정](https://supabase.com/docs/guides/auth/general-configuration), [API 키](https://supabase.com/docs/guides/getting-started/api-keys), [private Storage](https://supabase.com/docs/guides/storage/buckets/fundamentals), [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).
