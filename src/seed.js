import { today, addDays } from "./dates.js";
export const DEMO_USER = "11111111-1111-4111-8111-111111111111";
export const DEMO_FRIENDS = [
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
  "44444444-4444-4444-8444-444444444444",
];
export const demoProfileIcons = ["🌙", "🌿", "🐱", "🐻"];
export function emptyDocument() {
  return {
    version: 1,
    paper: "white",
    font: "system",
    background_asset_id: null,
    font_asset_id: null,
    blocks: [],
    stickers: [],
    habits: [],
  };
}
export function makeSeed() {
  const date = today();
  const now = new Date().toISOString();
  const ids = [DEMO_USER, ...DEMO_FRIENDS];
  const profiles = ["뿔", "태수", "미카", "올가"].map((nickname, i) => ({
    id: ids[i],
    nickname,
    avatar_asset_id: null,
    main_color: ["#6C80D9", "#568B78", "#BD668A", "#A78141"][i],
    background_color: ["#F3F5FF", "#F1F8F3", "#FFF4F7", "#FFF9EC"][i],
    created_at: now,
    updated_at: now,
    demo_icon: demoProfileIcons[i],
  }));
  const habits = [
    {
      id: "55555555-5555-4555-8555-555555555551",
      owner_id: DEMO_USER,
      name: "외출",
      type: "boolean",
      unit: "",
      position: 0,
      archived: false,
    },
    {
      id: "55555555-5555-4555-8555-555555555552",
      owner_id: DEMO_USER,
      name: "청소",
      type: "boolean",
      unit: "",
      position: 1,
      archived: false,
    },
    {
      id: "55555555-5555-4555-8555-555555555553",
      owner_id: DEMO_USER,
      name: "수면",
      type: "number",
      unit: "시간",
      position: 2,
      archived: false,
    },
  ];
  const make = (
    id,
    author_id,
    diary_date,
    title,
    text,
    tags,
    paper = "white",
  ) => ({
    id,
    author_id,
    diary_date,
    title,
    tags,
    status: "published",
    version: 1,
    created_at: `${diary_date}T02:30:00.000Z`,
    updated_at: now,
    published_at: `${diary_date}T02:30:00.000Z`,
    document: {
      ...emptyDocument(),
      paper,
      blocks: [{ id: crypto.randomUUID(), type: "text", text }],
    },
  });
  const entries = [
    make(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      DEMO_USER,
      date,
      "좋아하는 계절이 오고 있어",
      "바람이 조금 선선해졌다.\n걷다가 작은 카페에 들어갔는데,\n밀크티가 생각보다 맛있어서 행복했다.\n\n돌아오는 길에는 좋아하는 노래를 들었다.\n이런 평범한 하루가 오래 기억에 남았으면.",
      ["산책", "카페"],
    ),
    make(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
      DEMO_FRIENDS[1],
      date,
      "이런 하루도 괜찮지",
      "오늘은 느긋하게 집에 있었다.\n미뤄뒀던 그림도 조금 그리고,\n고양이랑 나란히 낮잠도 잤다.\n\n대단한 일은 없었지만\n이런 날도 기록해두고 싶어.",
      ["집순이", "고양이"],
      "lined",
    ),
    make(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
      DEMO_FRIENDS[0],
      addDays(date, -1),
      "퇴근길에 조금 돌아가기",
      "집으로 바로 가지 않고 공원 쪽으로 걸었다.\n생각보다 하늘이 예뻐서 한참을 올려다봤다.",
      ["일상", "산책"],
      "cream",
    ),
    make(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4",
      DEMO_FRIENDS[1],
      addDays(date, -1),
      "주말이 조금만 더 길었으면",
      "밀린 빨래를 하고 좋아하는 영화를 다시 봤다.\n내일도 오늘만큼 무사한 하루였으면.",
      ["일상"],
    ),
    ...[1, 2, 3, 4].map((offset, i) =>
      make(
        `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb${i}`,
        DEMO_USER,
        addDays(date, -offset),
        ["조금은 느린 하루", "좋아하는 것들", "작은 산책", "차 한 잔의 시간"][
          i
        ],
        [
          "오늘은 조금 느리게 보내기로 했다.\n급하지 않아도 되는 일이 생각보다 많다.",
          "좋아하는 플레이리스트를 정리했다.\n친구들에게도 들려주고 싶다.",
          "저녁을 먹고 동네를 한 바퀴 걸었다.\n이렇게 적어두니 오늘도 나쁘지 않았네.",
          "할 일을 끝내고 마시는 차 한 잔.\n작은 보상이 있어야 내일도 힘이 나지.",
        ][i],
        ["일상"],
        i % 2 ? "grid" : "white",
      ),
    ),
    make(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5",
      DEMO_FRIENDS[2],
      addDays(date, -2),
      "새로 산 책의 첫 페이지",
      "서점에서 오래 서성이다가 책을 한 권 데려왔다.\n다 읽으면 다 같이 이야기하고 싶어.",
      ["책", "휴식"],
      "cream",
    ),
  ];
  entries[0].document.habits = habits.map((h) => ({
    field_id: h.id,
    name: h.name,
    type: h.type,
    unit: h.unit,
    value: h.type === "number" ? 7 : true,
  }));
  return {
    profiles,
    entries,
    habits,
    preferences: {
      user_id: DEMO_USER,
      streak_mode: "weekly",
      default_paper: "white",
      default_font: "system",
      default_background_asset_id: null,
      default_font_asset_id: null,
    },
    assets: [],
    comments: [
      {
        id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1",
        entry_id: entries[0].id,
        author_id: DEMO_FRIENDS[1],
        content: "다음엔 나도 데려가 ☕",
        image_asset_id: null,
        created_at: `${date}T03:00:00.000Z`,
        updated_at: now,
      },
      {
        id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc2",
        entry_id: entries[1].id,
        author_id: DEMO_FRIENDS[0],
        content: "고양이 사진도 보여줘 ㅋㅋ",
        image_asset_id: null,
        created_at: `${date}T03:10:00.000Z`,
        updated_at: now,
      },
    ],
    reactions: [
      { entry_id: entries[0].id, user_id: DEMO_FRIENDS[0], emoji: "❤️" },
      { entry_id: entries[0].id, user_id: DEMO_FRIENDS[1], emoji: "❤️" },
      { entry_id: entries[1].id, user_id: DEMO_FRIENDS[2], emoji: "🐱" },
    ],
    reads: [],
  };
}
