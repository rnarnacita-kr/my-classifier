// 이름 · 전화번호를 [이름] [전화번호] 으로 바꾼다.
// 분류는 이 함수가 돌려준 가린 문장으로 한다.
(function (global) {
  // 010-1234-5678, 010 1234 5678, 01012345678, 010-0000-34XX 같은 꼴
  const PHONE = /(?:\+?82[-.\s]?)?0\d{1,2}[-.\s]?\d{3,4}[-.\s]?[\dXx*]{4}/g;

  // 흔한 성씨. 이름 찾기에만 쓴다.
  const SURNAMES = "김이박최정강조윤장임한오서신권황안송류유홍전고문양손배백허남심노하곽성차주구민진나지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥육인맹제모탁국은편용예경봉";

  // 1) 이름 바로 뒤에 오는 말: "이도윤 보호자", "정민준 엄마"
  const ROLES = "보호자|엄마|아빠|어머니|아버지|할머니|할아버지|이모|고모|삼촌|학부모";
  const NAME_BEFORE_ROLE = new RegExp(`[${SURNAMES}][가-힣]{2}(?=\\s?(?:${ROLES}))`, "g");

  // 2) 이름만 쓴 경우: "김민준 열이 나요", "박서연이 귀에", "김유정인데", "최하은은 괜찮아요"
  //    성씨 + 이름에 흔히 쓰는 글자 둘. 낱말(손가락, 편도선, 선생님, 오른쪽 등)과
  //    헷갈리지 않게 이름 글자를 좁혔다.
  const GIVEN = "민준서연지우도윤하은시현수예주아원유진호영재성건태희경혜정빈린율온담솔채다인규훈석철용혁환동상승세소미결찬별효명근람슬설라여";
  //    이름 뒤에 붙는 말(조사 · 서술)
  const AFTER = "은|는|이|가|의|를|을|도|랑|이랑|한테|에게|이가|이는|이를|이도|이의|이한테|인데|인데요|이에요|예요|이고|이요|이야|입니다|이라고|라고";
  const NAME_ALONE = new RegExp(
    `(^|[^가-힣])([${SURNAMES}][${GIVEN}]{2})(?=$|[^가-힣]|(?:${AFTER})(?:$|[^가-힣]))`,
    "g"
  );

  // 성씨 + 이름 글자로 이루어졌지만 이름이 아닌 낱말
  const NOT_NAMES = new Set(["정강이", "고양이", "원숭이"]);

  function mask(text) {
    let out = String(text || "");
    out = out.replace(PHONE, "[전화번호]");
    out = out.replace(NAME_BEFORE_ROLE, "[이름]");
    out = out.replace(NAME_ALONE, (m, pre, name) => (NOT_NAMES.has(name) ? m : pre + "[이름]"));
    return out;
  }

  global.maskText = mask;
})(typeof window !== "undefined" ? window : globalThis);
