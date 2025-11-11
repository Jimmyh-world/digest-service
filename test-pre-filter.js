/**
 * Pre-Filter Test Script
 * Tests the pre-filter service with sample articles
 */

import { preFilterArticles } from './src/services/pre-filter.js';
import { config } from 'dotenv';
config();

// Sample articles - mix of Energy and non-Energy to test semantic filtering
const testArticles = [
  {
    article_id: '1',
    title: 'Alzecure Pharmas förlust ökar',
    summary: 'Alzecure Pharma reported a loss after tax of 10.0 million kronor in the third quarter',
    source_name: 'Dagens Industri'
  },
  {
    article_id: '2',
    title: 'Softbank dumpar alla Nvidia-aktier',
    summary: 'Japanese investment firm Softbank sold all of its shares in chipmaker Nvidia for 5.8 billion dollars',
    source_name: 'Dagens Industri'
  },
  {
    article_id: '3',
    title: 'Megasol utvecklar banksystem',
    summary: 'Swedish fintech company Megasol has developed its own banking core system',
    source_name: 'Dagens Industri'
  },
  {
    article_id: '4',
    title: 'Vattenfall investerar i kärnkraft',
    summary: 'Major Swedish companies invest in Vattenfall nuclear power company for new Ringhals reactors',
    source_name: 'Dagens Industri'
  },
  {
    article_id: '5',
    title: 'Gigasun tecknar Kina-avtal för solenergi',
    summary: 'Solar energy company Gigasun signed six agreements with Chinese companies for solar installations',
    source_name: 'Dagens Industri'
  },
  {
    article_id: '6',
    title: 'Lovable närmar sig 8 miljoner användare',
    summary: 'Swedish AI coding platform Lovable is approaching 8 million users',
    source_name: 'Breakit'
  },
  {
    article_id: '7',
    title: 'Kina lättar på exportrestriktioner för batterimaterial',
    summary: 'China is easing export restrictions on lithium battery materials and rare earth metals',
    source_name: 'Dagens Industri'
  },
  {
    article_id: '8',
    title: 'Flexqube ökar orderingången',
    summary: 'Technology company Flexqube reported net sales decline but increased order intake',
    source_name: 'Dagens Industri'
  }
];

async function runTest() {
  try {
    console.log('='.repeat(60));
    console.log('PRE-FILTER TEST');
    console.log('='.repeat(60));
    console.log('');
    console.log('Testing semantic filtering with Energy topic');
    console.log('');
    console.log('INPUT ARTICLES:');
    testArticles.forEach((article, idx) => {
      console.log(`${idx + 1}. ${article.title}`);
    });
    console.log('');
    console.log('Expected to KEEP (Energy-related):');
    console.log('  - Vattenfall nuclear investment');
    console.log('  - Gigasun solar China deals');
    console.log('  - China battery materials');
    console.log('');
    console.log('Expected to REJECT (false positives):');
    console.log('  - Alzecure Pharma (pharma)');
    console.log('  - Softbank/Nvidia (investment)');
    console.log('  - Megasol banking (has "sol" but NOT solar energy)');
    console.log('  - Lovable AI coding (tech, not energy)');
    console.log('  - Flexqube (general tech)');
    console.log('');
    console.log('='.repeat(60));
    console.log('RUNNING PRE-FILTER...');
    console.log('='.repeat(60));
    console.log('');

    const filtered = await preFilterArticles({
      articles: testArticles,
      topics: ['Energy'],
      clientName: 'Test Client',
      targetCount: 5
    });

    console.log('');
    console.log('='.repeat(60));
    console.log('RESULTS');
    console.log('='.repeat(60));
    console.log('');
    console.log(`Filtered: ${filtered.length} articles selected from ${testArticles.length}`);
    console.log('');

    filtered.forEach((article, idx) => {
      console.log(`${idx + 1}. ${article.title}`);
      console.log(`   Score: ${article.pre_filter_score}/10`);
      console.log(`   Reason: ${article.pre_filter_reason}`);
      console.log('');
    });

    console.log('='.repeat(60));
    console.log('TEST ASSESSMENT');
    console.log('='.repeat(60));

    const hasVattenfall = filtered.some(a => a.title.includes('Vattenfall') || a.title.includes('kärnkraft'));
    const hasGigasun = filtered.some(a => a.title.includes('Gigasun') || a.title.includes('solenergi'));
    const hasBatteryMaterials = filtered.some(a => a.title.includes('batterimaterial') || a.title.includes('battery'));
    const hasMegasol = filtered.some(a => a.title.includes('Megasol'));
    const hasPharma = filtered.some(a => a.title.includes('Pharma'));
    const hasLovable = filtered.some(a => a.title.includes('Lovable'));

    console.log('');
    console.log(`✅ Vattenfall nuclear: ${hasVattenfall ? 'INCLUDED (correct)' : 'EXCLUDED (incorrect)'}`);
    console.log(`✅ Gigasun solar: ${hasGigasun ? 'INCLUDED (correct)' : 'EXCLUDED (incorrect)'}`);
    console.log(`✅ China batteries: ${hasBatteryMaterials ? 'INCLUDED (correct)' : 'EXCLUDED (incorrect)'}`);
    console.log(`❌ Megasol banking: ${hasMegasol ? 'INCLUDED (incorrect - false positive!)' : 'EXCLUDED (correct)'}`);
    console.log(`❌ Pharma: ${hasPharma ? 'INCLUDED (incorrect)' : 'EXCLUDED (correct)'}`);
    console.log(`❌ Lovable AI: ${hasLovable ? 'INCLUDED (incorrect)' : 'EXCLUDED (correct)'}`);
    console.log('');

    const correctSelections = [hasVattenfall, hasGigasun, hasBatteryMaterials].filter(Boolean).length;
    const incorrectSelections = [hasMegasol, hasPharma, hasLovable].filter(Boolean).length;

    console.log(`Correct Energy selections: ${correctSelections}/3`);
    console.log(`False positives: ${incorrectSelections}/3`);
    console.log('');

    if (correctSelections === 3 && incorrectSelections === 0) {
      console.log('🎉 TEST PASSED: Perfect semantic filtering!');
    } else if (correctSelections >= 2 && incorrectSelections === 0) {
      console.log('✅ TEST PASSED: Good semantic filtering');
    } else {
      console.log('⚠️  TEST NEEDS REVIEW: Check results above');
    }

    console.log('');

  } catch (error) {
    console.error('❌ TEST FAILED:', error.message);
    console.error('Stack:', error.stack);
  }
}

runTest();
