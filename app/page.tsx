import SplitBladeGame from '../src/components/SplitBladeGame';

export default function Home() {
  return (
    <main className="wrap">
      <section className="cabinet" aria-label="SplitBlade game cabinet">
        <SplitBladeGame />
      </section>
      <p className="caption">모바일 세로형 MVP Phaser 포트 · 하단 베기 패널에서 코어를 베어 지시를 발동하세요.</p>
    </main>
  );
}
