// ============================================
// FOOD ORDERING SYSTEM - CUSTOMER APP
// ============================================

const CONFIG = {
    API_URL: 'YOUR_APPS_SCRIPT_DEPLOYMENT_URL',
    CURRENCY_SYMBOL: 'BYN'
};

const BALI_API_CONFIGURED = /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(CONFIG.API_URL);

// State
let menuItems = [];
let cart = [];
let currentCategory = 'all';
let baliActiveMenuMode = 'kitchen';
const baliMenuSectionKeys=["kitchen","bar","hookah","tea"];
let baliVisibleMenuSections=Object.fromEntries(baliMenuSectionKeys.map(key=>[key,true]));
let baliMenuSearchText = '';
let availableEvents = [];
let receivedEventSnapshot=false;
let guestInterestDates=new Set();
const pendingInterestDates=new Set();
let showOnlyPlannedEvents=false;
let lastRenderedEventsView=false;
let lastWheelSlideAt=0;

// Карточки могут иметь разную ширину на ПК и мобильном экране.
// Индекс рассчитывается по реальным позициям, а не по фиксированным пикселям.
function carouselEventCards(track) {
    return [...track.querySelectorAll(".event-card")];
}
function carouselEventIndex(track, cards=carouselEventCards(track)) {
    if(!cards.length)return 0;
    // Активной считается АФИША В ЦЕНТРЕ экрана, а не у левого края.
    const viewport=track.getBoundingClientRect();
    const middle=viewport.left+viewport.width/2;
    let selected=0,best=Infinity;
    cards.forEach((card,i)=>{
        const rect=card.getBoundingClientRect();
        const diff=Math.abs(rect.left+rect.width/2-middle);
        if(diff<best){best=diff;selected=i;}
    });
    return selected;
}
function centerEventCard(track,card,animated=false) {
    if(!card)return;
    const viewport=track.getBoundingClientRect();
    const rect=card.getBoundingClientRect();
    const left=track.scrollLeft+rect.left+rect.width/2-viewport.left-viewport.width/2;
    track.scrollTo({
        left:Math.max(0,left),
        behavior:animated&&!window.matchMedia("(prefers-reduced-motion: reduce)").matches?"smooth":"instant"
    });
}
function updateEventCarouselPosition() {
    const track=document.getElementById("eventsGrid");
    const counter=document.getElementById("eventsCarouselPosition");
    if(!track||!counter)return;
    const cards=carouselEventCards(track);
    const active=carouselEventIndex(track,cards);
    for(const [index,card] of cards.entries()) {
        const focused=index===active;
        card.classList.toggle("is-active",focused);
        card.classList.toggle("is-neighbor",Math.abs(index-active)===1);
        if(focused)card.setAttribute("aria-current","true");
        else card.removeAttribute("aria-current");
    }
    counter.textContent=cards.length
        ? String(active+1).padStart(2,"0")+" / "+String(cards.length).padStart(2,"0")
        : "Нет мероприятий";
}
function scrollEventCarousel(direction) {
    const track=document.getElementById("eventsGrid");
    if(!track)return;
    const cards=carouselEventCards(track);
    if(cards.length<2)return;
    const current=carouselEventIndex(track,cards);
    const target=Math.max(0,Math.min(cards.length-1,current+direction));
    centerEventCard(track,cards[target],true);
}
function initEventCarousel() {
    const track=document.getElementById("eventsGrid");
    if(!track)return;
    // Scroll is native/composited; update active styles only once per paint frame.
    let eventScrollFrame=0;
    track.addEventListener("scroll",()=>{
        if(eventScrollFrame)return;
        eventScrollFrame=requestAnimationFrame(()=>{
            eventScrollFrame=0;
            updateEventCarouselPosition();
        });
    },{passive:true});
    track.addEventListener("wheel",event=>{
        // Don't hijack vertical gestures on mobile devices.
        if(window.matchMedia("(max-width:767px)").matches)return;
        if(event.ctrlKey||Math.abs(event.deltaX)>Math.abs(event.deltaY))return;
        const direction=Math.sign(event.deltaY);
        if(!direction)return;
        const cards=carouselEventCards(track);
        if(cards.length<2)return;
        // Вертикальное колесо прокручивает карусель по одной карточке.
        event.preventDefault();
        const now=performance.now();
        if(now-lastWheelSlideAt<420)return;
        lastWheelSlideAt=now;
        scrollEventCarousel(direction);
    },{passive:false});
    track.addEventListener("keydown",event=>{
        if(event.key!=="ArrowRight"&&event.key!=="ArrowLeft")return;
        event.preventDefault();
        scrollEventCarousel(event.key==="ArrowRight"?1:-1);
    });
    // Подгоняем слайд под вертикальную пропорцию сторис 9:16.
    // Высота берётся из реального пространства между верхним меню и нижней панелью.
    const fitStorySlides=()=>{
        if(track.clientWidth<1||track.clientHeight<1)return;
        const mobile=window.matchMedia("(max-width: 767px)").matches;
        const width=Math.min(
            390,
            track.clientWidth*(mobile?.82:.40),
            (track.clientHeight-14)*9/16,
            // Reserve a readable information area and two pinned CTAs below
            // the square image, including on small landscape devices.
            Math.max(96,track.clientHeight-(mobile?185:195))
        );
        // On low-height phones and rotated tablets, the slide must fit inside
        // the available carousel height rather than imposing a fixed 155px width.
        const rounded=Math.max(96,Math.floor(width));
        const previous=track.style.getPropertyValue("--bali-event-slide-width");
        if(previous===rounded+"px")return;
        const active=carouselEventCards(track).find(card=>card.classList.contains("is-active"));
        const activeDate=active?.dataset.eventDate;
        track.style.setProperty("--bali-event-slide-width",rounded+"px");
        requestAnimationFrame(()=>{
            const cards=carouselEventCards(track);
            const selected=cards.find(card=>card.dataset.eventDate===activeDate)||cards[0];
            if(selected)centerEventCard(track,selected,false);
            updateEventCarouselPosition();
        });
    };
    if(typeof ResizeObserver==="function"){
        const observer=new ResizeObserver(fitStorySlides);
        observer.observe(track);
    }
    window.addEventListener("resize",fitStorySlides,{passive:true});
    fitStorySlides();
    updateEventCarouselPosition();
}

// Update both RSVP controls in place. Do not recreate the carousel on each click.
function syncInterestVisuals(){
    for(const card of document.querySelectorAll("#homeEventCarousel .bali-home-event-card[data-event-date]")){
        const heart=card.querySelector(".bali-home-heart");
        if(!heart)continue;
        const date=card.dataset.eventDate;
        const liked=guestInterestDates.has(date);
        const waiting=pendingInterestDates.has(date);
        const title=card.querySelector("h3")?.textContent||"мероприятие";
        heart.classList.toggle("is-liked",liked);
        heart.classList.toggle("is-saving",waiting);
        heart.setAttribute("aria-pressed",String(liked));
        heart.setAttribute("aria-label",liked?"Убрать «"+title+"» из моих планов":"Хочу пойти на «"+title+"»");
        heart.setAttribute("aria-busy",String(waiting));
        heart.title=liked?"Убрать из моих планов":"Хочу пойти";
        heart.disabled=waiting;
    }
    for(const card of document.querySelectorAll("#eventsGrid .event-card[data-event-date]")){
        const button=card.querySelector(".event-want-to-go");
        if(!button)continue;
        const date=card.dataset.eventDate;
        const selected=guestInterestDates.has(date);
        const waiting=pendingInterestDates.has(date);
        button.classList.toggle("selected",selected);
        button.setAttribute("aria-pressed",String(selected));
        button.setAttribute("aria-busy",String(waiting));
        button.textContent=selected?"✓ В моих планах":"Хочу пойти";
        button.title=selected?"Нажмите, чтобы убрать мероприятие из планов":"Добавить мероприятие в планы";
        button.disabled=waiting;
    }
}
function setInterestSelection(date,selected){
    if(selected)guestInterestDates.add(date);
    else guestInterestDates.delete(date);
    syncInterestVisuals();
}
// Instant local feedback; Firestore remains the authority and an error rolls it back.
async function toggleGuestInterest(date,message){
    if(pendingInterestDates.has(date))return;
    if(!window.BaliInterests){
        if(message)message.textContent="Подключение к Firebase ещё загружается. Попробуйте снова.";
        return;
    }
    const previous=guestInterestDates.has(date);
    pendingInterestDates.add(date);
    setInterestSelection(date,!previous);
    if(message)message.textContent="";
    try{
        const result=await window.BaliInterests.toggle(date);
        if(result?.loginRequired){
            setInterestSelection(date,previous);
            if(message)message.textContent="Войдите в личный кабинет, чтобы сохранить мероприятие.";
            return;
        }
        if(result?.busy){
            setInterestSelection(date,previous);
            return;
        }
        if(typeof result?.selected!=="boolean")throw new Error("Не удалось подтвердить изменение.");
        setInterestSelection(date,result.selected);
        if(message)message.textContent=result.selected?"Добавлено в «Мои планы».":"Удалено из «Моих планов».";
    }catch(error){
        setInterestSelection(date,previous);
        if(message)message.textContent=error?.message||"Не удалось сохранить мероприятие.";
    }finally{
        pendingInterestDates.delete(date);
        syncInterestVisuals();
        if(showOnlyPlannedEvents)renderUpcomingEvents();
    }
}
window.addEventListener('bali:interests',({detail})=>{
    const incoming=new Set(detail?.dates||[]);
    // Preserve the user's immediate action while an older remote snapshot arrives.
    for(const date of pendingInterestDates){
        if(guestInterestDates.has(date))incoming.add(date);
        else incoming.delete(date);
    }
    const changed=incoming.size!==guestInterestDates.size||
        [...incoming].some(date=>!guestInterestDates.has(date));
    guestInterestDates=incoming;
    if(showOnlyPlannedEvents&&changed)renderUpcomingEvents();
    else syncInterestVisuals();
});
window.addEventListener('bali:interests-error',({detail})=>{
    const status=document.getElementById("eventsInterestStatus");
    if(status)status.textContent=detail?.message||"Не удалось загрузить список выбранных событий.";
});

// Выбор количества на каждой карточке; не зависит от содержимого корзины.
const menuQuantities = new Map();
const MAX_MENU_QUANTITY = 50;
function selectedMenuQuantity(id) {
    return menuQuantities.get(id) || 1;
}
function handleMenuGridClick(event) {
    const button = event.target.closest('button[data-menu-action]');
    if (!button || !elements.menuGrid.contains(button)) return;
    const itemId = Number(button.dataset.id);
    if (!Number.isSafeInteger(itemId) || itemId <= 0) return;
    const action = button.dataset.menuAction;
    const product = menuItems.find(item => Number(item.id) === itemId);
    if (!product) return;
    if (action === "details") {
        openBaliMenuDetails(product);
        return;
    }
    if (!product.available) return;
    const quantity = selectedMenuQuantity(itemId);
    if (action === 'add') {
        addToCart(itemId, quantity);
        return;
    }
    const next = Math.min(MAX_MENU_QUANTITY, Math.max(1, quantity + (action === 'plus' ? 1 : -1)));
    menuQuantities.set(itemId, next);
    const card = button.closest('.menu-item');
    if (!card) return;
    const output = card.querySelector('.menu-quantity-value');
    if (output) output.textContent = String(next);
    const minus = card.querySelector('[data-menu-action="minus"]');
    const plus = card.querySelector('[data-menu-action="plus"]');
    if (minus) minus.disabled = next <= 1;
    if (plus) plus.disabled = next >= MAX_MENU_QUANTITY;
}

// Публичный каталог и календарь поступают из Firestore.
window.addEventListener('bali:menu', ({ detail }) => {
    menuItems = detail.items;
    // Цены в старой корзине никогда не используем: пересчитываем по свежему каталогу.
    const actual = new Map(menuItems.filter(x => x.available).map(x => [Number(x.id), x]));
    cart = cart.flatMap(old => {
        const product = actual.get(Number(old.id));
        return product ? [{
            id: product.id, name: product.name, price: product.price,
            quantity: Math.min(50, Math.max(1, Number(old.quantity) || 1))
        }] : [];
    });
    saveCart();
    updateCartUI();
    updateCategoryButtons();
    displayMenuItems(menuItems);
});
window.addEventListener('bali:menu-error', () => showError('Не удалось загрузить меню из Firestore. Проверьте правила доступа.'));
window.addEventListener('bali:events', ({ detail }) => {
    const incoming=detail.events||[];
    // An RSVP transaction changes interestCount, not the poster or event data.
    // Keep the existing carousels mounted so the heart responds without a jump.
    const unchangedPosters=receivedEventSnapshot&&availableEvents.length===incoming.length&&
        availableEvents.every((previous,i)=>{
            const next=incoming[i];
            if(previous.date!==next?.date)return false;
            const publicFields=({interestCount,...other})=>other;
            return JSON.stringify(publicFields(previous))===JSON.stringify(publicFields(next));
        });
    availableEvents=incoming;
    receivedEventSnapshot=true;
    if(unchangedPosters){
        const counts=new Map(incoming.map(event=>[event.date,
            Number.isSafeInteger(event.interestCount)&&event.interestCount>=0?event.interestCount:0]));
        for(const [selector,countClass] of [
            ["#homeEventCarousel .bali-home-event-card[data-event-date]",".bali-home-event-count"],
            ["#eventsGrid .event-card[data-event-date]",".event-interest-count"]
        ]){
            for(const card of document.querySelectorAll(selector)){
                const label=card.querySelector(countClass);
                if(label)label.textContent="Хочет пойти: "+(counts.get(card.dataset.eventDate)||0);
            }
        }
        return;
    }
    populateEvents();
    renderUpcomingEvents();
    updateHomeNextEvent();
    renderHomeEvents();
});
window.addEventListener('bali:events-error', () => {
    const select = document.getElementById('eventSelect');
    if (select) select.innerHTML = '<option value="">Не удалось загрузить мероприятия</option>';
});
// Клиентские разделы BALI: URL/история браузера работают без перезагрузки.
const BALI_GUEST_PAGES = new Set(["home","menu","events","profile","id","contacts"]);
function routeFromLocation() {
    const hash=window.location.hash.slice(1).toLowerCase();
    return BALI_GUEST_PAGES.has(hash)?hash:"home";
}
// iOS Safari may restore the document's vertical offset after the SPA layout
// has been mounted. Reset only the page's Y position; never modify X or
// carousel scrollLeft, so horizontal event swipes remain unaffected.
function resetGuestVerticalPosition(page) {
    const root=document.scrollingElement||document.documentElement;
    if(root)root.scrollTop=0;
    document.documentElement.scrollTop=0;
    document.body.scrollTop=0;
    if(page==="home"){
        const home=document.querySelector("#homeSection .bali-home-inner");
        if(home)home.scrollTop=0;
    }
}

function renderGuestPage(page,{scroll=true}={}) {
    const selected=BALI_GUEST_PAGES.has(page)?page:"home";
    const sections={
        home:"homeSection", menu:"menuPage",
        events:"eventsSection", profile:"profileSection", id:"baliIdSection", contacts:"contactsSection"
    };
    for(const [name,id] of Object.entries(sections)) {
        const section=document.getElementById(id);
        if(section)section.hidden=name!==selected;
    }
    const back=document.getElementById("homeFloatingBtn");
    if(back)back.hidden=true;
    for(const button of document.querySelectorAll("[data-bali-nav]")){
        const active=button.dataset.baliNav===selected;
        button.classList.toggle("active",active);
        if(active)button.setAttribute("aria-current","page");
        else button.removeAttribute("aria-current");
    }
    const dock=document.getElementById("baliCartDock");
    if(dock)dock.hidden=selected!=="menu"||baliActiveMenuMode!=="kitchen";
    document.body.dataset.baliPage=selected;
    // Корзина не остаётся открытой при переходе из меню.
    if(selected!=="menu" && typeof closeCart==="function")closeCart();
    if(selected==="events")renderUpcomingEvents();
    if(selected==="home")renderHomeEvents();
    if(scroll)resetGuestVerticalPosition(selected);
}
function switchBaliMenuMode(nextMode) {
    // The administrator controls visibility, not product existence.
    const available=baliMenuSectionKeys.filter(key=>baliVisibleMenuSections[key]);
    const mode=available.includes(nextMode)?nextMode:(available[0]||null);
    const changedMode=baliActiveMenuMode!==mode;
    baliActiveMenuMode=mode;
    window.BaliActiveMenuMode=mode;
    if(changedMode){
        const search=document.getElementById("baliMenuSearch");
        if(search)search.value="";
        baliMenuSearchText="";
    }
    document.querySelectorAll("#baliSharedCategories [data-menu-filter]").forEach(filter=>{
        filter.hidden=filter.dataset.menuFilter!==mode;
    });
    const shared=document.getElementById("baliSharedMenuControls");
    if(shared)shared.hidden=!mode;
    const panels={
        kitchen:"baliKitchenContent",
        bar:"baliBarContent",
        hookah:"baliHookahContent",
        tea:"baliTeaContent"
    };
    for(const [section,id] of Object.entries(panels)){
        const node=document.getElementById(id);
        if(node)node.hidden=mode!==section;
    }
    document.querySelectorAll("#baliMenuModeSwitch [data-bali-menu-mode]").forEach(button=>{
        const section=button.dataset.baliMenuMode;
        const visible=baliVisibleMenuSections[section]===true;
        button.hidden=!visible;
        button.disabled=!visible;
        const active=visible&&section===mode;
        button.classList.toggle("is-active",active);
        button.setAttribute("aria-pressed",String(active));
    });
    const notice=document.getElementById("baliMenuUnavailableNotice");
    if(notice)notice.hidden=available.length>0;
    const dock=document.getElementById("baliCartDock");
    if(dock)dock.hidden=document.body.dataset.baliPage!=="menu"||mode!=="kitchen";
    if(mode!=="kitchen"&&typeof closeCart==="function")closeCart();
    if(changedMode){
        if(mode==="kitchen")displayMenuItems(menuItems);
        window.dispatchEvent(new CustomEvent("bali:menu-mode-changed",{detail:{mode}}));
    }
}

function navigateGuestPage(page,{replace=false}={}) {
    const selected=BALI_GUEST_PAGES.has(page)?page:"home";
    const path=selected==="home"?
        window.location.pathname+window.location.search:
        "#"+selected;
    if(routeFromLocation()!==selected) {
        if(replace)history.replaceState({baliPage:selected},"",path);
        else history.pushState({baliPage:selected},"",path);
    }
    renderGuestPage(selected);
}
function showGuestSection(section) {
    navigateGuestPage(section);
}
function updateHomeNextEvent() {
    const text=document.getElementById("homeNextEvent");
    if(!text)return;
    const next=availableEvents
      .filter(e=>typeof e?.date==="string"&&e.date>=minskDateToday())
      .sort((a,b)=>a.date.localeCompare(b.date))[0];
    text.textContent=next
        ? new Intl.DateTimeFormat("ru-RU",{day:"numeric",month:"long",timeZone:"Europe/Minsk"})
            .format(new Date(next.date+"T12:00:00+03:00"))+" · "+next.title
        : "Афиши и календарь вечеринок";
}

function renderHomeEvents() {
    const track=document.getElementById("homeEventCarousel");
    if(!track)return;
    const previousScroll=track.scrollLeft;
    const preserveScroll=track.dataset.homeView==="all";
    track.dataset.homeView="all";
    const today=minskDateToday();
    // Five event slots are filled ONLY on the PC HOME preview; the complete
    // calendar below never receives these promotional placeholders.
    const isPcHome=window.matchMedia("(min-width:1180px)").matches;
    const upcoming=availableEvents
        .filter(e=>/^\d{4}-\d{2}-\d{2}$/.test(e?.date||"")&&e.date>=today)
        .sort((a,b)=>a.date.localeCompare(b.date))
        // The FULL events calendar remains unlimited; only the homepage is capped.
        .slice(0,window.matchMedia("(max-width:767px)").matches?3:5);
    track.replaceChildren();
    if(!upcoming.length&&!isPcHome){
        const p=document.createElement("p");
        p.className="bali-home-event-empty";
        p.textContent="Афиши ближайших мероприятий пока не опубликованы.";
        track.append(p);
        return;
    }
    for(const event of upcoming){
        // The homepage visually matches the square-poster event cards, without
        // the two CTA buttons. The heart uses the exact existing RSVP transaction.
        const card=document.createElement("article");
        card.className="bali-home-event-card";
        card.dataset.eventDate=event.date;
        const posterWrap=document.createElement("div");
        posterWrap.className="bali-home-poster-wrap";
        const img=document.createElement("img");
        img.src=safeImageUrl(event.poster_url);
        img.alt="Афиша "+event.title;
        img.loading="lazy";
        posterWrap.append(img);
        const dateBadge=document.createElement("time");
        dateBadge.className="bali-home-date-badge";
        dateBadge.dateTime=event.date;
        const dateParts=new Intl.DateTimeFormat("ru-RU",{
            timeZone:"Europe/Minsk",day:"numeric",month:"short",weekday:"short"
        }).formatToParts(new Date(event.date+"T12:00:00+03:00"));
        const part=type=>dateParts.find(x=>x.type===type)?.value||"";
        const badgeDay=document.createElement("strong");
        badgeDay.textContent=part("day");
        const badgeMonth=document.createElement("span");
        badgeMonth.textContent=part("month").toUpperCase();
        const badgeWeekday=document.createElement("small");
        badgeWeekday.textContent=part("weekday").toUpperCase();
        dateBadge.append(badgeDay,badgeMonth,badgeWeekday);
        posterWrap.append(dateBadge);

        const information=document.createElement("div");
        information.className="bali-home-event-info";
        const title=document.createElement("h3");
        title.textContent=event.title;
        const times=document.createElement("p");
        times.className="bali-home-event-hours";
        const validTime=/^([01]\d|2[0-3]):[0-5]\d$/;
        const startTime=String(event.startTime||"");
        const endTime=String(event.endTime||"");
        times.textContent=validTime.test(startTime)&&validTime.test(endTime)
            ?startTime+"–"+endTime:"Время уточняется";
        const description=document.createElement("p");
        description.className="bali-home-event-description";
        description.textContent=typeof event.description==="string"
            ?event.description.trim().slice(0,600):"";
        description.hidden=!description.textContent;
        const attending=document.createElement("p");
        attending.className="bali-home-event-count";
        const count=Number.isSafeInteger(event.interestCount)&&event.interestCount>=0
            ?event.interestCount:0;
        attending.textContent="Хочет пойти: "+count;
        information.append(title,times,description,attending);

        const openCard=document.createElement("button");
        openCard.type="button";
        openCard.className="bali-home-open-event";
        openCard.setAttribute("aria-label","Открыть мероприятие "+event.title);
        openCard.addEventListener("click",()=>{
            showOnlyPlannedEvents=false;
            navigateGuestPage("events");
            requestAnimationFrame(()=>{
                const target=document.querySelector('#eventsGrid .event-card[data-event-date="'+event.date+'"]');
                if(target)centerEventCard(document.getElementById("eventsGrid"),target,true);
            });
        });

        const heart=document.createElement("button");
        heart.type="button";
        heart.className="bali-home-heart";
        const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
        svg.setAttribute("viewBox","0 0 24 24");
        svg.setAttribute("fill","none");
        svg.setAttribute("stroke","currentColor");
        svg.setAttribute("stroke-width","1.9");
        svg.setAttribute("stroke-linecap","round");
        svg.setAttribute("stroke-linejoin","round");
        svg.setAttribute("aria-hidden","true");
        const path=document.createElementNS("http://www.w3.org/2000/svg","path");
        path.setAttribute("d","M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z");
        svg.append(path);
        heart.append(svg);
        heart.addEventListener("click",click=>{
            click.preventDefault();
            click.stopPropagation();
            void toggleGuestInterest(event.date,document.getElementById("homeInterestFeedback"));
        });
        card.append(posterWrap,information,openCard,heart);
        track.append(card);
        // Initial paint matches current Firestore/optimistic state.
        if(guestInterestDates.has(event.date))heart.classList.add("is-liked");
        heart.setAttribute("aria-pressed",String(guestInterestDates.has(event.date)));
        heart.setAttribute("aria-label",guestInterestDates.has(event.date)
            ?"Убрать «"+event.title+"» из моих планов":"Хочу пойти на «"+event.title+"»");
        heart.title=guestInterestDates.has(event.date)?"Убрать из моих планов":"Хочу пойти";
        heart.disabled=pendingInterestDates.has(event.date);
    }
    // Fill only vacant PC HOME slots. These are decorative announcements:
    // no fake date, RSVP heart, event link, or calendar record is created.
    if(isPcHome){
        const settings=window.BaliHomePlaceholder||{
            posterTitle:"SECRET",kicker:"SECRET",
            footerTitle:"СКОРО В BALI",footerSubtitle:"Совсем скоро узнаете",
            imageUrl:"",accentColor:"#b9ff51",backgroundColor:"#12171c"
        };
        const missing=Math.max(0,5-upcoming.length);
        for(let i=0;i<missing;i++){
            const card=document.createElement("article");
            card.className="bali-home-event-card bali-home-event-placeholder";
            card.setAttribute("aria-label",settings.posterTitle+" — "+settings.footerTitle);
            card.style.setProperty("--bali-secret-accent",settings.accentColor);
            card.style.setProperty("--bali-placeholder-footer",settings.backgroundColor);
            const poster=document.createElement("div");
            poster.className="bali-home-poster-wrap bali-home-placeholder-poster";
            // Black is the default teaser background. An administrator may
            // still intentionally upload a custom picture for all placeholders.
            if(settings.imageUrl){
                const picture=document.createElement("img");
                picture.className="bali-home-placeholder-image";
                picture.src=settings.imageUrl;
                picture.alt="";
                picture.loading="lazy";
                poster.append(picture);
            }
            const overlay=document.createElement("div");
            overlay.className="bali-home-placeholder-overlay";
            const message=document.createElement("strong");
            message.className="bali-home-placeholder-message";
            message.textContent=settings.posterTitle;
            overlay.append(message);
            poster.append(overlay);
            const information=document.createElement("div");
            information.className="bali-home-event-info bali-home-placeholder-info";
            information.style.backgroundColor=settings.backgroundColor;
            const name=document.createElement("h3");
            name.textContent=settings.footerTitle;
            const hint=document.createElement("p");
            hint.className="bali-home-event-hours";
            hint.textContent=settings.footerSubtitle;
            information.append(name,hint);
            card.append(poster,information);
            track.append(card);
        }
    }
    if(preserveScroll&&previousScroll>0){
        requestAnimationFrame(()=>{
            track.scrollLeft=Math.min(previousScroll,Math.max(0,track.scrollWidth-track.clientWidth));
        });
    }else{
        track.scrollLeft=0;
    }
}

// Switch between three phone posters and five tablet/desktop posters
// when the browser crosses the responsive breakpoint.
window.matchMedia("(max-width:767px)").addEventListener("change",()=>{
    if(document.body.dataset.baliPage==="home")renderHomeEvents();
});
window.matchMedia("(min-width:1180px)").addEventListener("change",()=>{
    if(document.body.dataset.baliPage==="home")renderHomeEvents();
});
window.addEventListener("bali:home-placeholder",()=>{
    if(document.body.dataset.baliPage==="home")renderHomeEvents();
});
function renderUpcomingEvents() {
    const grid=document.getElementById("eventsGrid");
    if(!grid)return;
    const previousCards=carouselEventCards(grid);
    const previousIndex=carouselEventIndex(grid,previousCards);
    const previousDate=previousCards[previousIndex]?.dataset.eventDate;
    const changedView=lastRenderedEventsView!==showOnlyPlannedEvents;
    lastRenderedEventsView=showOnlyPlannedEvents;
    grid.replaceChildren();
    const today=minskDateToday();
    const allUpcoming=availableEvents
      .filter(e=>e?.date>=today&&/^\d{4}-\d{2}-\d{2}$/.test(e?.date||""))
      .sort((a,b)=>a.date.localeCompare(b.date));
    const planned=allUpcoming.filter(e=>guestInterestDates.has(e.date));
    const upcoming=showOnlyPlannedEvents?planned:allUpcoming;
    if(!upcoming.length) {
        const empty=document.createElement("div");
        empty.className="events-empty";
        empty.textContent=showOnlyPlannedEvents
            ?"В планах пока нет будущих мероприятий. Нажмите «Хочу пойти» на интересующем событии."
            :"Ближайшие мероприятия пока не опубликованы.";
        grid.append(empty);
        grid.scrollLeft=0;
        updateEventCarouselPosition();
        return;
    }
    for (const event of upcoming) {
        const card=document.createElement("article");
        card.className="event-card";
        card.dataset.eventDate=event.date;
        const posterWrap=document.createElement("div");
        posterWrap.className="bali-event-poster-wrap";
        const poster=document.createElement("img");
        poster.className="event-poster";
        poster.alt="Афиша: "+event.title;
        poster.loading="lazy";
        poster.src=safeImageUrl(event.poster_url);
        posterWrap.append(poster);
        const dateBadge=document.createElement("time");
        dateBadge.className="bali-event-date-badge";
        dateBadge.dateTime=event.date;
        const parts=new Intl.DateTimeFormat("ru-RU",{timeZone:"Europe/Minsk",day:"numeric",month:"short",weekday:"short"})
          .formatToParts(new Date(event.date+"T12:00:00+03:00"));
        const part=key=>parts.find(x=>x.type===key)?.value||"";
        dateBadge.innerHTML="<strong>"+part("day")+"</strong><span>"+part("month").toUpperCase()+"</span><small>"+part("weekday").toUpperCase()+"</small>";
        posterWrap.append(dateBadge);
        const body=document.createElement("div");
        body.className="event-card-body";
        const name=document.createElement("h3");
        name.textContent=event.title;
        // These are the actual start/end fields entered by the administrator.
        // The preorder cutoff is intentionally NOT used as an event end time.
        const times=document.createElement("p");
        times.className="bali-event-hours";
        const validTime=/^([01]\d|2[0-3]):[0-5]\d$/;
        const startTime=String(event.startTime||"");
        const endTime=String(event.endTime||"");
        times.textContent=validTime.test(startTime)&&validTime.test(endTime)
            ?startTime+"–"+endTime
            :"Время уточняется";
        const description=document.createElement("p");
        description.className="bali-event-description";
        description.textContent=typeof event.description==="string"
            ?event.description.trim().slice(0,600):"";
        description.hidden=!description.textContent;
        const open=event.preorderEnabled===true&&event.closesAt?.toDate?.()>new Date();
        if(open){
            const openBadge=document.createElement("span");
            openBadge.className="bali-event-preorder-badge";
            openBadge.textContent="● Предзаказ открыт";
            posterWrap.append(openBadge);
        }
        const interested=document.createElement("p");
        interested.className="event-interest-count";
        const count=Number.isSafeInteger(event.interestCount)&&event.interestCount>=0?event.interestCount:0;
        interested.textContent="Хочет пойти: "+count;
        const planBtn=document.createElement("button");
        planBtn.type="button";
        planBtn.className="event-want-to-go"+(guestInterestDates.has(event.date)?" selected":"");
        planBtn.setAttribute("aria-pressed",String(guestInterestDates.has(event.date)));
        planBtn.textContent=guestInterestDates.has(event.date)?"✓ В моих планах":"Хочу пойти";
        planBtn.title=guestInterestDates.has(event.date)
            ?"Нажмите, чтобы убрать мероприятие из планов":"Добавить мероприятие в планы";
        planBtn.disabled=pendingInterestDates.has(event.date);
        const message=document.createElement("p");
        message.className="event-interest-message";
        message.setAttribute("role","status");
        planBtn.addEventListener("click",()=>void toggleGuestInterest(event.date,message));
        // Date appears once, in the badge over the square poster.
        // The information can scroll independently when long; actions stay
        // at the absolute bottom of the visible event card.
        const details=document.createElement("div");
        details.className="bali-event-info";
        details.append(name,times,description,interested,message);
        const actions=document.createElement("div");
        actions.className="bali-event-actions";
        actions.append(planBtn);
        body.append(details,actions);
        card.append(posterWrap,body);
        grid.append(card);
    }
    syncInterestVisuals();
    const restoreIndex=changedView?0:Math.max(0,upcoming.findIndex(e=>e.date===previousDate));
    const restore=()=>{
        const cards=carouselEventCards(grid);
        if(!cards.length)return;
        centerEventCard(grid,cards[restoreIndex],false);
        updateEventCarouselPosition();
    };
    grid.scrollLeft=0;
    requestAnimationFrame(restore);
}
function updateCategoryButtons() {
    const all = [...new Set(menuItems.map(i => i.category).filter(Boolean))];
    if (currentCategory !== 'all' && !all.includes(currentCategory)) currentCategory = 'all';
    elements.categoryFilter.replaceChildren();
    for (const category of ['all', ...all]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'category-btn' + (currentCategory === category ? ' active' : '');
        button.dataset.category = category;
        button.setAttribute('aria-pressed', String(currentCategory === category));
        button.textContent = category === 'all' ? 'Всё меню' : category;
        elements.categoryFilter.append(button);
    }
}
function minskDateToday() {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Minsk', day: '2-digit', month: '2-digit', year: 'numeric'
    }).formatToParts(new Date());
    const p = Object.fromEntries(parts.map(x => [x.type,x.value]));
    return p.year + '-' + p.month + '-' + p.day;
}
function populateEvents() {
    const select = document.getElementById('eventSelect');
    if (!select) return;
    const chosen = select.value;
    select.replaceChildren(new Option('Выбери мероприятие', ''));
    for (const event of availableEvents.filter(e => e.preorderEnabled && e.date >= minskDateToday() && e.closesAt?.toDate?.() > new Date())) {
        const opt = new Option(event.date + ' — ' + event.title, event.date);
        select.add(opt);
    }
    if (availableEvents.some(e => e.date === chosen && e.preorderEnabled && e.closesAt?.toDate?.() > new Date())) select.value=chosen;
    document.getElementById('eventDate').value = select.value;
    if (select.length === 1) select.options[0].textContent = 'Доступных мероприятий пока нет';
}
function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, c =>
        ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function safeImageUrl(value) {
    try {
        const u = new URL(String(value ?? ''));
        if (u.protocol === 'https:' || u.protocol === 'http:') return escapeHTML(u.href);
        if (/^data:image\/webp;base64,[A-Za-z0-9+/=]+$/.test(String(value||""))
          && String(value).length <= 210000) return String(value);
    } catch (_) { /* fallback */ }
    return 'https://placehold.co/400x200?text=BALI';
}


// DOM Elements
const elements = {
    menuGrid: document.getElementById('menuGrid'),
    cartSidebar: document.getElementById('cartSidebar'),
    cartItems: document.getElementById('cartItems'),
    totalAmount: document.getElementById('totalAmount'),
    overlay: document.getElementById('overlay'),
    checkoutModal: document.getElementById('checkoutModal'),
    successModal: document.getElementById('successModal'),
    checkoutForm: document.getElementById('checkoutForm'),
    checkoutItems: document.getElementById('checkoutItems'),
    checkoutTotal: document.getElementById('checkoutTotal'),
    displayOrderId: document.getElementById('displayOrderId'),
    categoryFilter: document.getElementById('categoryFilter')
};

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    loadConfig();
    loadCart();
    initializeApp();
    attachEventListeners();
    initStickyCategories();
    initEventCarousel();
    renderGuestPage(routeFromLocation());
    // Safari can reapply saved scroll positions once layout/fonts become ready.
    // Do a second Y-only reset after the first painted frame.
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
        resetGuestVerticalPosition(routeFromLocation());
    }));
    // Возврат смартфона/браузера переключает разделы приложения.
    window.addEventListener("popstate",()=>renderGuestPage(routeFromLocation()));
    window.addEventListener("hashchange",()=>renderGuestPage(routeFromLocation()));
    // pageshow also fires when restored from the back-forward cache on iPhone.
    window.addEventListener("pageshow",()=>{
        renderGuestPage(routeFromLocation());
        requestAnimationFrame(()=>requestAnimationFrame(()=>{
            resetGuestVerticalPosition(routeFromLocation());
        }));
    });
    // Tab restoration can be delayed until after the page is visible again.
    document.addEventListener("visibilitychange",()=>{
        if(document.visibilityState!=="visible")return;
        resetGuestVerticalPosition(routeFromLocation());
    });
    // При наступлении следующего дня по Минску прошедшие события
    // исчезают из «Моих планов» даже без перезагрузки страницы.
    let shownDay=minskDateToday();
    window.setInterval(()=>{
        const today=minskDateToday();
        if(today!==shownDay){
            shownDay=today;
            renderUpcomingEvents();
        }
    },60000);
});

// Высота шапки меняется при переходе между телефоном/планшетом/ПК.
// Категории остаются закреплены ровно ПОД шапкой без перекрытия кнопок.
function initStickyCategories() {
    const header = document.querySelector('.header');
    if (!header) return;
    const banner=document.querySelector(".bali-preview-banner");
    const syncHeight = () => {
        document.documentElement.style.setProperty('--bali-header-height', header.getBoundingClientRect().height + 'px');
        document.documentElement.style.setProperty('--bali-banner-height',
            ((banner&&!banner.hidden)?banner.getBoundingClientRect().height:0)+'px');
    };
    syncHeight();
    if (typeof ResizeObserver === 'function') {
        const observer = new ResizeObserver(syncHeight);
        observer.observe(header);
        if(banner)observer.observe(banner);
    }
    window.addEventListener('resize', syncHeight, {passive: true});
}

function initializeApp() {
    fetchMenuItems();
}

async function loadConfig() {
    if (!BALI_API_CONFIGURED) return;
    try {
        const response = await fetch(`${CONFIG.API_URL}?path=config`);
        const data = await response.json();
        if (data.success && data.config) {
            if (data.config.restaurant_name) {
                // Бренд и название приложения фиксированы: Bali.
                document.title = 'Bali';
            }
            if (data.config.currency_symbol) {
                CONFIG.CURRENCY_SYMBOL = data.config.currency_symbol;
                updateCartUI(); // Update any existing prices in UI
            }
        }
    } catch (e) {
        console.warn('Failed to load config:', e);
    }
}

function attachEventListeners() {
    document.getElementById("baliMenuModeSwitch")?.addEventListener("click",async event=>{
        const tab=event.target.closest("button[data-bali-menu-mode]");
        if(!tab||tab.hidden||tab.disabled)return;
        const mode=tab.dataset.baliMenuMode;
        if(mode===baliActiveMenuMode)return;
        if(mode==="bar"||mode==="hookah"){
            // NEVER activate restricted lists before an explicit YES.
            let permitted=false;
            try{permitted=Boolean(await window.BaliAgeGate?.confirm?.());}
            catch(error){console.warn("BALI age gate:",error);}
            if(!permitted){switchBaliMenuMode("kitchen");return;}
        }
        switchBaliMenuMode(mode);
    });
    switchBaliMenuMode("kitchen");
    window.addEventListener("bali:menu-visibility",event=>{
        const incoming=event.detail||{};
        for(const key of baliMenuSectionKeys){
            if(typeof incoming[key]==="boolean")baliVisibleMenuSections[key]=incoming[key];
        }
        // Preserve the current mode if still published; otherwise select another.
        switchBaliMenuMode(baliActiveMenuMode);
    });
    // The Firestore module might finish loading before this listener is attached.
    if(window.BaliMenuVisibility){
        const incoming=window.BaliMenuVisibility;
        for(const key of baliMenuSectionKeys){
            if(typeof incoming[key]==="boolean")baliVisibleMenuSections[key]=incoming[key];
        }
        switchBaliMenuMode(baliActiveMenuMode);
    }
    for(const nav of document.querySelectorAll("[data-bali-nav]")){
        nav.addEventListener("click",()=>{
            if(nav.dataset.baliNav==="id"&&!window.BaliAuth?.isRegistered?.()){
                window.BaliAuth?.open?.();return;
            }
            // The Calendar tab always opens all events; the personal
            // "Мои планы" view remains available from the profile page.
            if(nav.dataset.baliNav==="events")showOnlyPlannedEvents=false;
            navigateGuestPage(nav.dataset.baliNav);
        });
    }
    // Mobile user account and BALI ID are two independent routes.
    const openAccount=()=>{
        if(!window.BaliAuth?.isRegistered?.()){window.BaliAuth?.open?.();return;}
        navigateGuestPage("profile");
    };
    const openId=()=>{
        if(!window.BaliAuth?.isRegistered?.()){window.BaliAuth?.open?.();return;}
        navigateGuestPage("id");
    };
    document.getElementById("baliMobileProfileBtn")?.addEventListener("click",openAccount);
    document.getElementById("baliMobileIdBtn")?.addEventListener("click",openId);
    document.getElementById("baliCartDock")?.addEventListener("click",openCart);
    document.getElementById("baliMenuSearch")?.addEventListener("input",event=>{
        baliMenuSearchText=String(event.target.value||"").trim().toLocaleLowerCase("ru-RU");
        displayMenuItems(menuItems);
    });
    document.getElementById("profileMyOrdersBtn")?.addEventListener("click",()=>void openMyOrders());
    document.getElementById("profileMyPlansBtn")?.addEventListener("click",()=>{
        showOnlyPlannedEvents=true;
        navigateGuestPage("events");
    });
    document.getElementById("profileDataBtn")?.addEventListener("click",()=>window.BaliAuth?.open());
    document.getElementById("profileLogoutBtn")?.addEventListener("click",()=>{
        if(window.BaliAuth?.isRegistered())document.getElementById("authSignOutBtn")?.click();
        else window.BaliAuth?.open();
    });
    window.addEventListener("bali:auth-state",({detail})=>{
        const mobileId=document.getElementById("baliMobileIdBtn");
        const mobileProfile=document.getElementById("baliMobileProfileBtn");
        if(mobileId)mobileId.setAttribute("aria-label",detail?.registered?"Открыть мою BALI ID карту":"Войти, чтобы получить BALI ID");
        if(mobileProfile)mobileProfile.setAttribute("aria-label",detail?.registered?"Открыть мой профиль":"Войти в личный кабинет");
        if(!detail?.registered&&document.body.dataset.baliPage==="id")navigateGuestPage("profile",{replace:true});
        const name=document.getElementById("baliProfileName");
        const phone=document.getElementById("baliProfilePhone");
        const email=document.getElementById("baliProfileEmail");
        const avatar=document.querySelector(".bali-profile-avatar");
        const logout=document.getElementById("profileLogoutBtn");
        if(name)name.textContent=detail?.name||"Гость BALI";
        if(phone)phone.textContent=detail?.phone||"Войдите в личный кабинет";
        if(email)email.textContent=detail?.email||"";
        if(avatar)avatar.textContent=(detail?.name||"B").trim().slice(0,1).toLocaleUpperCase("ru-RU");
        if(logout)logout.hidden=!detail?.signedIn;
    });
    document.getElementById("menuNavBtn")?.addEventListener("click",event=>{
        event.preventDefault();showGuestSection("menu");
    });
    document.getElementById("eventsNavBtn")?.addEventListener("click",()=>{
        showOnlyPlannedEvents=false;
        showGuestSection("events");
    });

    document.getElementById("homeFloatingBtn")?.addEventListener("click",()=>{
        showGuestSection("home");
    });
    document.getElementById("homeBrandBtn")?.addEventListener("click",event=>{
        event.preventDefault();showGuestSection("home");
    });
    document.getElementById("accountMyOrdersBtn")?.addEventListener("click",()=>{
        document.getElementById("closeAuth")?.click();
        void openMyOrders();
    });

    const eventSelect = document.getElementById('eventSelect');
    if (eventSelect) eventSelect.addEventListener('change', () => {
        document.getElementById('eventDate').value = eventSelect.value;
    });

    // Управление количеством над кнопкой «В корзину» (на всех карточках меню).
    elements.menuGrid.addEventListener('click', handleMenuGridClick);

    // Cart controls
    document.getElementById('closeCart').addEventListener('click', closeCart);
    document.getElementById('checkoutBtn').addEventListener('click', openCheckout);

    // Modal controls
    document.getElementById('closeCheckout').addEventListener('click', closeCheckout);
    document.getElementById('closeSuccess').addEventListener('click', closeSuccess);
    elements.overlay.addEventListener('click', closeAllModals);

    // Form submission
    elements.checkoutForm.addEventListener('submit', handleCheckout);

    // Category filter
    elements.categoryFilter.addEventListener('click', handleCategoryFilter);

    document.getElementById('closeMyOrders').addEventListener('click', closeMyOrders);
    document.getElementById('successMyOrders').addEventListener('click', async () => {
        closeSuccess();
        await openMyOrders();
    });

    // Location Sharing
    const shareBtn = document.getElementById('shareLocationBtn');
    if (shareBtn) shareBtn.addEventListener('click', handleShareLocation);

    // Reload on success close
    document.getElementById('closeSuccess').addEventListener('click', () => {
        window.location.reload();
    });
}

// ============================================
// API CALLS
// ============================================

async function fetchMenuItems() {
    elements.menuGrid.innerHTML = '<div class="loading-state"><p>Загружаем меню BALI...</p></div>';
}

let editingOrderId = null;
async function placeOrder(orderData) {
    try {
        if (!window.BaliOrders) throw new Error('Модуль предзаказов ещё загружается. Обновите страницу.');
        const result = await window.BaliOrders.save(orderData, editingOrderId);
        editingOrderId = null;
        return result;
    } catch (error) {
        return { success:false, error: window.BaliOrders?.errorText(error) || error.message };
    }
}

// ============================================
// MENU DISPLAY
// ============================================

function displayMenuItems(items) {
    if (!items || items.length === 0) {
        elements.menuGrid.classList.remove('menu-categories-layout');
        elements.menuGrid.innerHTML = '<div class="loading-state"><p>Меню ещё не заполнено администратором.</p></div>';
        return;
    }
    // Даже при «Всё меню» карточки организованы внутри своих категорий.
    // Порядок категорий следует порядку первого появления в каталоге,
    // порядок блюд внутри каждой категории сохраняется из Firestore.
    const categoryItems = currentCategory === 'all'
        ? items
        : items.filter(item => item.category === currentCategory);
    const filteredItems = baliMenuSearchText
        ? categoryItems.filter(item=>[item.name,item.description,item.category,item.weight,item.detailText]
          .some(value=>String(value||"").toLocaleLowerCase("ru-RU").includes(baliMenuSearchText)))
        : categoryItems;
    const groups = new Map();
    for (const item of filteredItems) {
        const name = String(item.category || 'Другие блюда').trim() || 'Другие блюда';
        if (!groups.has(name)) groups.set(name, []);
        groups.get(name).push(item);
    }
    elements.menuGrid.classList.add('menu-categories-layout');
    elements.menuGrid.innerHTML = [...groups.entries()]
        .map(([category, products]) => `
            <section class="menu-category-block" aria-label="${escapeHTML(category)}">
                <div class="menu-category-heading">
                    <h3 class="menu-category-title">${escapeHTML(category)}</h3>
                    <span class="menu-category-count">${products.length} ${products.length === 1 ? 'позиция' : (products.length % 10 >= 2 && products.length % 10 <= 4 && (products.length % 100 < 12 || products.length % 100 > 14) ? 'позиции' : 'позиций')}</span>
                </div>
                <div class="menu-grid menu-category-products">
                    ${products.map(item => createMenuItemHTML(item)).join('')}
                </div>
            </section>
        `).join('') || '<div class="loading-state"><p>В этой категории пока нет блюд.</p></div>';
    // Обработчик кнопок +/- и корзины привязан к внешнему #menuGrid
    // и работает с вложенными карточками без повторной подписки.
}

function createMenuItemHTML(item) {
    const unavailable = !item.available;
    const id = Number(item.id);
    const price = Number(item.price) || 0;
    if (!Number.isSafeInteger(id) || id < 0 || price < 0) return '';
    // Empty or invalid images have no DOM node and reserve zero card space.
    const imageSource=String(item.image_url||"").trim();
    const safeImage=imageSource?safeImageUrl(imageSource):"";
    const withImage=Boolean(imageSource&&safeImage!=="https://placehold.co/400x200?text=BALI");
    const hasDetails=Boolean(String(item.detailText||"").trim());
    return `
        <div class="menu-item ${unavailable ? 'unavailable' : ''} ${withImage ? '' : 'menu-item--no-image'}" data-id="${id}">
            <button type="button" class="menu-details-btn ${hasDetails ? 'has-details' : 'no-details'}"
                    data-menu-action="details" data-id="${id}"
                    aria-label="${hasDetails ? 'Подробная информация: ' : 'Подробное описание отсутствует: '}${escapeHTML(item.name)}"
                    title="${hasDetails ? 'Информация о блюде' : 'Подробное описание пока не добавлено'}"
                    ${hasDetails ? '' : 'disabled aria-disabled="true"'}>
              <svg viewBox="0 0 24 24" width="25" height="25" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9.2"/><path d="M12 10.7v5.5M12 7.65h.01"/></svg>
            </button>
            ${withImage ? `<img src="${safeImage}"
                alt="${escapeHTML(item.name)}" class="menu-item-image">` : ''}
            <div class="menu-item-content">
                <span class="menu-item-category">${escapeHTML(item.category)}</span>
                <div class="menu-item-header">
                    <h3 class="menu-item-name">${escapeHTML(item.name)}</h3>
                    <span class="menu-item-price">${CONFIG.CURRENCY_SYMBOL} ${price.toFixed(2)}</span>
                </div>
                <p class="menu-item-description">${escapeHTML(item.description)}</p>
                ${item.weight ? `<span class="menu-item-weight">${escapeHTML(item.weight)}</span>` : ''}
                ${unavailable
                    ? '<span class="unavailable-badge">Недоступно</span>'
                    : `<div class="menu-purchase-controls">
                        <div class="menu-quantity" role="group" aria-label="Количество: ${escapeHTML(item.name)}">
                            <button type="button" class="menu-quantity-btn" data-menu-action="minus" data-id="${id}" aria-label="Уменьшить количество: ${escapeHTML(item.name)}" ${selectedMenuQuantity(id) === 1 ? 'disabled' : ''}>−</button>
                            <span class="menu-quantity-value" aria-live="polite">${selectedMenuQuantity(id)}</span>
                            <button type="button" class="menu-quantity-btn" data-menu-action="plus" data-id="${id}" aria-label="Увеличить количество: ${escapeHTML(item.name)}" ${selectedMenuQuantity(id) === MAX_MENU_QUANTITY ? 'disabled' : ''}>+</button>
                        </div>
                        <button type="button" class="add-to-cart-btn" data-menu-action="add" data-id="${id}">В корзину</button>
                    </div>`
                }
            </div>
        </div>
    `;
}

// If an uploaded/remote photo is unavailable, collapse the image area just
// like an item without a picture. Captures image-load errors on new cards too.
elements.menuGrid?.addEventListener("error",event=>{
    const image=event.target;
    if(!(image instanceof HTMLImageElement)||!image.matches(".menu-item-image"))return;
    const item=image.closest(".menu-item");
    image.remove();
    item?.classList.add("menu-item--no-image");
},true);

// The information icon is always displayed, but only text-filled products open.
// The modal uses the existing cart and quantity data, not a second checkout flow.
let openMenuDetailsProductId=null;
function syncMenuQuantityInCard(id){
    const card=elements.menuGrid.querySelector('.menu-item[data-id="'+id+'"]');
    if(!card)return;
    const value=selectedMenuQuantity(id);
    const count=card.querySelector(".menu-quantity-value");
    const minus=card.querySelector('[data-menu-action="minus"]');
    const plus=card.querySelector('[data-menu-action="plus"]');
    if(count)count.textContent=String(value);
    if(minus)minus.disabled=value<=1;
    if(plus)plus.disabled=value>=MAX_MENU_QUANTITY;
}
function openBaliMenuDetails(product) {
    if(!String(product.detailText||"").trim())return;
    const dialog=document.getElementById("baliMenuDetailsDialog");
    const body=document.getElementById("baliMenuDetailsBody");
    const actions=document.getElementById("baliMenuDetailsActions");
    if(!dialog||!body||!actions)return;
    openMenuDetailsProductId=Number(product.id);
    body.replaceChildren();
    actions.replaceChildren();
    const make=(tag,className,content)=>{
        const node=document.createElement(tag);
        if(className)node.className=className;
        if(content!==undefined)node.textContent=content;
        return node;
    };
    const imageValue=String(product.detailImageUrl||product.image_url||"").trim();
    const src=imageValue?safeImageUrl(imageValue):"";
    if(src&&src!=="https://placehold.co/400x200?text=BALI"){
        const photo=make("img","bali-menu-details-photo");
        photo.src=src;
        photo.alt="Фотография блюда: "+String(product.name||"");
        photo.addEventListener("error",()=>photo.remove(),{once:true});
        body.append(photo);
    }
    body.append(make("h2","bali-menu-details-name",product.name||""));
    const price=Number(product.price)||0;
    body.append(make("strong","bali-menu-details-price",
        CONFIG.CURRENCY_SYMBOL+" "+price.toFixed(2)));
    if(String(product.weight||"").trim())
        body.append(make("p","bali-menu-details-weight","Граммовка / объём: "+product.weight.trim()));
    if(String(product.description||"").trim()){
        body.append(make("h3","bali-menu-details-label","Состав и основные сведения"));
        body.append(make("p","bali-menu-details-copy",product.description));
    }
    body.append(make("h3","bali-menu-details-label","Подробное описание"));
    body.append(make("p","bali-menu-details-copy",product.detailText));
    const group=make("div","bali-menu-details-quantity");
    group.setAttribute("role","group");
    group.setAttribute("aria-label","Количество блюда");
    const minus=make("button","bali-menu-details-step","−");
    const count=make("output","bali-menu-details-count");
    const plus=make("button","bali-menu-details-step","+");
    const add=make("button","bali-menu-details-add",product.available?"В корзину":"Недоступно");
    for(const [button,label] of [[minus,"Уменьшить количество"],[plus,"Увеличить количество"]]){
        button.type="button";
        button.setAttribute("aria-label",label);
    }
    add.type="button";
    add.disabled=!product.available;
    function refresh(){
        const current=selectedMenuQuantity(openMenuDetailsProductId);
        count.value=String(current);
        count.textContent=String(current);
        minus.disabled=!product.available||current<=1;
        plus.disabled=!product.available||current>=MAX_MENU_QUANTITY;
        syncMenuQuantityInCard(openMenuDetailsProductId);
    }
    function adjust(delta){
        const current=selectedMenuQuantity(openMenuDetailsProductId);
        const next=Math.max(1,Math.min(MAX_MENU_QUANTITY,current+delta));
        menuQuantities.set(openMenuDetailsProductId,next);
        refresh();
    }
    minus.addEventListener("click",()=>adjust(-1));
    plus.addEventListener("click",()=>adjust(1));
    add.addEventListener("click",()=>{
        const id=openMenuDetailsProductId;
        if(!Number.isSafeInteger(id))return;
        if(addToCart(id,selectedMenuQuantity(id))===true)dialog.close();
    });
    group.append(minus,count,plus);
    actions.append(group,add);
    refresh();
    if(dialog.open)dialog.close();
    dialog.showModal();
}
document.getElementById("baliMenuDetailsClose")?.addEventListener("click",()=>{
    document.getElementById("baliMenuDetailsDialog")?.close();
});
document.getElementById("baliMenuDetailsDialog")?.addEventListener("click",event=>{
    if(event.target===event.currentTarget)event.currentTarget.close();
});
document.getElementById("baliMenuDetailsDialog")?.addEventListener("close",()=>{
    openMenuDetailsProductId=null;
});

function showLoading() {
    elements.menuGrid.innerHTML = `
        <div class="loading-state">
            <div class="spinner"></div>
            <p>Loading menu...</p>
        </div>
    `;
}

function showError(message) {
    elements.menuGrid.innerHTML = `
        <div class="loading-state">
            <p style="color: var(--error-color)">❌ ${message}</p>
        </div>
    `;
}

// ============================================
// CATEGORY FILTER
// ============================================

function handleCategoryFilter(e) {
    const button = e.target.closest('.category-btn');
    if (!button || !elements.categoryFilter.contains(button)) return;
    currentCategory = button.dataset.category;
    for (const item of elements.categoryFilter.querySelectorAll('.category-btn')) {
        const selected = item === button;
        item.classList.toggle('active', selected);
        item.setAttribute('aria-pressed', String(selected));
    }
    displayMenuItems(menuItems);
    // On phones only the list itself scrolls, never the whole page.
    const menuSection = document.querySelector('.menu-section');
    if (menuSection && window.matchMedia('(max-width:767px)').matches) {
        menuSection.scrollTop = 0;
    } else if (menuSection) {
        const header = document.querySelector('.header');
        const sticky = document.querySelector('.categories');
        const y = window.scrollY + menuSection.getBoundingClientRect().top
            - (header?.getBoundingClientRect().height || 0)
            - (sticky?.getBoundingClientRect().height || 0) - 8;
        window.scrollTo({top: Math.max(0,y),behavior:'smooth'});
    }
}

// ============================================
// CART MANAGEMENT
// ============================================

function addToCart(itemId, quantity = 1) {
    const item = menuItems.find(i => i.id === itemId);
    if (!item || !item.available) return false;
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_MENU_QUANTITY) return false;
    const existingItem = cart.find(i => i.id === itemId);
    const amountAlreadyInCart = existingItem?.quantity || 0;
    if (amountAlreadyInCart + quantity > MAX_MENU_QUANTITY) {
        alert('Не более 50 единиц одного блюда в корзине. Сейчас в корзине: ' + amountAlreadyInCart + '.');
        return false;
    }
    if (existingItem) {
        existingItem.quantity += quantity;
    } else {
        cart.push({
            id: item.id,
            name: item.name,
            price: item.price,
            quantity
        });
    }
    saveCart();
    updateCartUI();
    const button = elements.menuGrid.querySelector('.add-to-cart-btn[data-id="' + itemId + '"]');
    if (button) {
        button.classList.add('menu-add-success');
        window.setTimeout(() => button.classList.remove('menu-add-success'), 280);
    }
    return true;
}

function removeFromCart(itemId) {
    cart = cart.filter(item => item.id !== itemId);
    saveCart();
    updateCartUI();
}

function updateQuantity(itemId, delta) {
    const item = cart.find(i => i.id === itemId);
    if (!item) return;
    if (item.quantity + delta > 50) {
        alert('Не более 50 единиц одного блюда.'); return;
    }

    item.quantity += delta;

    if (item.quantity <= 0) {
        removeFromCart(itemId);
    } else {
        saveCart();
        updateCartUI();
    }
}

function updateCartUI() {
    // Update cart count
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

    // Update cart items display
    if (cart.length === 0) {
        elements.cartItems.innerHTML = `
            <div class="empty-cart">
                <span class="empty-icon">🛒</span>
                <p>Your cart is empty</p>
                <p class="empty-subtitle">Add items from the menu</p>
            </div>
        `;
        document.getElementById('checkoutBtn').disabled = true;
    } else {
        elements.cartItems.innerHTML = cart
            .map(item => createCartItemHTML(item))
            .join('');
        document.getElementById('checkoutBtn').disabled = false;

        // Attach remove and quantity listeners
        attachCartListeners();
    }

    // Update total
    const total = calculateTotal();
    elements.totalAmount.textContent = `${total.toFixed(2)} BYN`;
    const dockTotal=document.getElementById("baliDockTotal");
    const dockCount=document.getElementById("baliDockCount");
    if(dockTotal)dockTotal.textContent=`${total.toFixed(2)} BYN`;
    if(dockCount)dockCount.textContent=String(totalItems);
    window.dispatchEvent(new CustomEvent("bali:cart-changed",{
        detail:{count:totalItems,total}
    }));
}

function createCartItemHTML(item) {
    return `
        <div class="cart-item" data-id="${item.id}">
            <div class="cart-item-header">
                <span class="cart-item-name">${escapeHTML(item.name)}</span>
                <button class="remove-item" data-id="${item.id}">✕</button>
            </div>
            <div class="cart-item-details">
                <div class="quantity-controls">
                    <button class="qty-btn qty-minus" data-id="${item.id}">-</button>
                    <span class="qty-value">${item.quantity}</span>
                    <button class="qty-btn qty-plus" data-id="${item.id}">+</button>
                </div>
                <span class="cart-item-price">${(item.price * item.quantity).toFixed(2)} BYN</span>
            </div>
        </div>
    `;
}

function attachCartListeners() {
    // Remove buttons
    document.querySelectorAll('.remove-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const itemId = parseInt(e.currentTarget.dataset.id);
            removeFromCart(itemId);
        });
    });

    // Quantity buttons
    document.querySelectorAll('.qty-minus').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const itemId = parseInt(e.currentTarget.dataset.id);
            updateQuantity(itemId, -1);
        });
    });

    document.querySelectorAll('.qty-plus').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const itemId = parseInt(e.currentTarget.dataset.id);
            updateQuantity(itemId, 1);
        });
    });
}

function calculateTotal() {
    return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
}

function saveCart() {
    localStorage.setItem('foodhub_cart', JSON.stringify(cart));
}

function loadCart() {
    try {
        const parsed = JSON.parse(localStorage.getItem('foodhub_cart') || '[]');
        cart = Array.isArray(parsed) ? parsed.slice(0, 100).filter(item =>
            Number.isSafeInteger(Number(item.id)) &&
            Number.isFinite(Number(item.price)) &&
            Number(item.price) >= 0 &&
            Number.isInteger(Number(item.quantity)) &&
            Number(item.quantity) >= 1 && Number(item.quantity) <= 99
        ).map(item => ({
            id: Number(item.id),
            name: String(item.name ?? '').slice(0, 150),
            price: Number(item.price),
            quantity: Number(item.quantity)
        })) : [];
    } catch (error) {
        cart = [];
    }
    updateCartUI();
}

function clearCart() {
    cart = [];
    saveCart();
    updateCartUI();
}

// ============================================
// CART SIDEBAR
// ============================================

function openCart() {
    elements.cartSidebar.classList.add('active');
    elements.overlay.classList.add('active');
}

function closeCart() {
    elements.cartSidebar.classList.remove('active');
    elements.overlay.classList.remove('active');
}

// ============================================
// CHECKOUT & LOCATION
// ============================================

async function openCheckout() {
    if (cart.length === 0) return;

    // Незарегистрированный пользователь не может попасть к оформлению.
    if (!window.BaliAuth) {
        alert('Модуль авторизации недоступен. Проверьте соединение и настройки Firebase.');
        return;
    }
    if (!(await window.BaliAuth.requireProfile())) return;
    const customer = window.BaliAuth.getProfile();
    if (!customer) return;
    document.getElementById('customerName').value = customer.name;
    document.getElementById('customerPhone').value = customer.phone;
    document.getElementById('customerEmail').value = customer.email;

    closeCart();

    // Populate checkout items
    elements.checkoutItems.innerHTML = cart
        .map(item => `
            <div class="summary-item">
                <span>${escapeHTML(item.name)} × ${item.quantity}</span>
                <span>${(item.price * item.quantity).toFixed(2)} BYN</span>
            </div>
        `)
        .join('');

    elements.checkoutTotal.textContent = `${calculateTotal().toFixed(2)} BYN`;

    elements.checkoutModal.classList.add('active');
    elements.overlay.classList.add('active');
}

function closeCheckout() {
    elements.checkoutModal.classList.remove('active');
    elements.overlay.classList.remove('active');
}

function handleShareLocation() {
    const btn = document.getElementById('shareLocationBtn');
    const addressInput = document.getElementById('deliveryAddress');

    if (!navigator.geolocation) {
        alert('Geolocation is not supported by your browser');
        return;
    }

    btn.classList.add('loading');
    btn.textContent = '📍 Locating...';

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;

            document.getElementById('latitude').value = lat;
            document.getElementById('longitude').value = lng;

            // Format link and append to address
            const currentVal = addressInput.value;
            const pinText = `[Pinned Location: ${lat}, ${lng}]`;

            if (!currentVal.includes('Pinned Location')) {
                addressInput.value = (currentVal ? currentVal + '\n' : '') + pinText;
            }

            btn.classList.remove('loading');
            btn.textContent = '📍 Location Pinned!';
            setTimeout(() => btn.textContent = '📍 Pin Location', 3000);
        },
        (error) => {
            console.error('Error getting location:', error);
            btn.classList.remove('loading');
            btn.textContent = '📍 Failed';
            alert('Unable to retrieve your location. Please ensure you are using HTTPS or localhost.');
            setTimeout(() => btn.textContent = '📍 Pin Location', 3000);
        }
    );
}

async function handleCheckout(e) {
    e.preventDefault();

    // Проверяем актуальную авторизацию повторно перед отправкой.
    if (!window.BaliAuth || !(await window.BaliAuth.requireProfile())) return;
    const customer = window.BaliAuth.getProfile();
    if (!customer) return;
    const eventDate = document.getElementById('eventSelect').value;
    const tableNumber = document.getElementById('tableNumber').value.trim();
    const bookingId = document.getElementById('bookingId').value.trim();
    if (!availableEvents.some(e => e.date === eventDate && e.preorderEnabled && e.closesAt?.toDate?.() > new Date())) {
        alert('Выберите доступное мероприятие из списка.');
        return;
    }
    if (!tableNumber && !bookingId) {
        alert('Укажите номер столика или ID бронирования.');
        return;
    }

    const formData = {
        customer_uid: customer.uid,
        customer_name: customer.name,
        customer_phone: customer.phone,
        customer_email: customer.email,
        event_date: eventDate,
        table_number: tableNumber,
        booking_id: bookingId,
        notes: document.getElementById('orderNotes').value,
        items: cart,
        total_amount: calculateTotal()
    };

    // Disable button
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Отправляем...';

    const result = await placeOrder(formData);

    if (result.success) {
        // Show success modal
        elements.displayOrderId.textContent = result.order_number
            ? String(result.order_number).padStart(2,'0')
            : result.order_id;

        // Store order ID for tracking
        localStorage.setItem('last_order_id', result.order_id);

        closeCheckout();
        showSuccess();

        // Clear cart
        clearCart();

        // Reset form
        elements.checkoutForm.reset();
        submitBtn.disabled = false;
        submitBtn.textContent = 'Отправить предзаказ';
    } else {
        alert('Failed to place order: ' + (result.error || 'Unknown error'));
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span>Place Order</span><span class="btn-icon">→</span>';
    }
}

function showSuccess() {
    elements.successModal.classList.add('active');
    elements.overlay.classList.add('active');
}

function closeSuccess() {
    elements.successModal.classList.remove('active');
    elements.overlay.classList.remove('active');
}

let myOrders = [];
window.addEventListener('bali:orders', ({detail}) => {
    myOrders = detail.orders;
    renderMyOrders();
});
window.addEventListener('bali:orders-error', ({detail}) => {
    const list = document.getElementById('myOrdersList');
    if(list) list.textContent = 'Не удалось получить предзаказы: ' + detail.message;
});
async function openMyOrders() {
    if (!window.BaliAuth || !(await window.BaliAuth.requireProfile())) return;
    closeCart();
    closeCheckout();
    document.getElementById('myOrdersModal').classList.add('active');
    document.getElementById('myOrdersModal').setAttribute('aria-hidden','false');
    elements.overlay.classList.add('active');
    renderMyOrders();
}
function closeMyOrders() {
    document.getElementById('myOrdersModal')?.classList.remove('active');
    document.getElementById('myOrdersModal')?.setAttribute('aria-hidden','true');
    if (!elements.checkoutModal.classList.contains('active') &&
        !elements.successModal.classList.contains('active') &&
        !elements.cartSidebar.classList.contains('active')) {
        elements.overlay.classList.remove('active');
    }
}
function renderMyOrders() {
    const list = document.getElementById('myOrdersList');
    if (!list) return;
    list.replaceChildren();
    if (!myOrders.length) {
        const empty = document.createElement('p');
        empty.textContent = 'Пока нет оформленных предзаказов.';
        list.append(empty);
        return;
    }
    const statusText = {
        pending:'Ожидает подтверждения',
        confirmed:'Подтверждён',
        completed:'Выполнен',
        cancelled:'Отменён'
    };
    for (const order of myOrders) {
        const card = document.createElement('article');
        card.className='bali-order-card';
        const head = document.createElement('h4');
        head.textContent='№ '+(Number.isInteger(order.orderNumber)
            ? String(order.orderNumber).padStart(2,'0') : order.id)
            +' · '+(statusText[order.status]||order.status);
        const meta = document.createElement('p');
        meta.textContent=order.eventDate+' · '+(order.tableNumber?'Столик '+order.tableNumber:'ID '+order.bookingId);
        const items = document.createElement('ul');
        for(const item of order.items||[]) {
            const li = document.createElement('li');
            li.textContent=item.name+' × '+item.quantity+' — '+(item.quantity*item.unitPrice).toFixed(2)+' BYN';
            items.append(li);
        }
        const sum = document.createElement('strong');
        sum.textContent='Итого: '+Number(order.total||0).toFixed(2)+' BYN';
        card.append(head,meta,items,sum);
        if(order.status === 'pending') {
            const actions = document.createElement('div');
            actions.className='bali-order-actions';
            const edit = document.createElement('button');
            edit.type='button';edit.textContent='Изменить';edit.className='auth-btn';
            edit.addEventListener('click',()=>editMyOrder(order.id));
            const cancel = document.createElement('button');
            cancel.type='button';cancel.textContent='Отменить';cancel.className='auth-outline-btn';
            cancel.addEventListener('click',async()=>{
                if(!confirm('Отменить этот предзаказ?'))return;
                cancel.disabled=true;
                try{await window.BaliOrders.cancel(order.id);}
                catch(error){alert(window.BaliOrders.errorText(error));cancel.disabled=false;}
            });
            actions.append(edit,cancel);card.append(actions);
        }
        list.append(card);
    }
}
async function editMyOrder(orderId) {
    try {
        const order = await window.BaliOrders.getOrderWithItems(orderId);
        if(order.status !== 'pending') throw new Error('Предзаказ уже подтверждён.');
        const ids = new Set(order.items.map(x=>x.id));
        if(order.items.length>12) throw new Error('В предзаказе больше 12 разных позиций.');
        const known = new Map(menuItems.filter(x=>x.available).map(x=>[x.id,x]));
        if([...ids].some(id=>!known.has(id)))
            throw new Error('Некоторые блюда больше недоступны. Обратитесь к администратору.');
        cart = order.items.map(line=>({
            id:line.id,name:known.get(line.id).name,price:known.get(line.id).price,
            quantity:line.quantity
        }));
        saveCart();updateCartUI();
        editingOrderId=orderId;
        closeMyOrders();
        await openCheckout();
        const select=document.getElementById('eventSelect');
        select.value=order.eventDate;
        document.getElementById('eventDate').value=order.eventDate;
        document.getElementById('tableNumber').value=order.tableNumber;
        document.getElementById('bookingId').value=order.bookingId;
        document.getElementById('orderNotes').value=order.notes||'';
    }catch(error){alert(window.BaliOrders?.errorText(error)||error.message);}
}

// ============================================
// UTILITIES
// ============================================

function closeAllModals() {
    closeCart();
    closeCheckout();
    closeSuccess();
    closeMyOrders();
}
