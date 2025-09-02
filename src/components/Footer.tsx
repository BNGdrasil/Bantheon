import React from 'react';
import { APP_CONFIG, BNGDRASIL_PROJECTS } from '@/utils/constants';

const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-gray-900 text-gray-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* 프로젝트 소개 */}
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center space-x-2 mb-4">
              <div className="h-8 w-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">BNG</span>
              </div>
              <span className="font-bold text-xl text-white">{APP_CONFIG.NAME}</span>
            </div>
            <p className="text-gray-400 mb-4 leading-relaxed">
              {APP_CONFIG.DESCRIPTION}
            </p>
            <p className="text-sm text-gray-500">
              개인 클라우드 인프라 프로젝트로, 포트폴리오부터 게임 플랫폼, API 게이트웨이까지
              하나의 생태계로 구축된 통합 서비스입니다.
            </p>
          </div>

          {/* BNGdrasil 프로젝트들 */}
          <div>
            <h3 className="font-semibold text-white mb-4">BNGdrasil 생태계</h3>
            <ul className="space-y-2">
              {Object.entries(BNGDRASIL_PROJECTS).map(([key, project]) => (
                <li key={key}>
                  <a
                    href={project.github}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-400 hover:text-white transition-colors text-sm flex items-center space-x-2"
                  >
                    <span>{project.emoji}</span>
                    <span>{project.name}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* 연락처 및 링크 */}
          <div>
            <h3 className="font-semibold text-white mb-4">연락처</h3>
            <ul className="space-y-2">
              <li>
                <a
                  href={`mailto:${APP_CONFIG.CONTACT_EMAIL}`}
                  className="text-gray-400 hover:text-white transition-colors text-sm"
                >
                  이메일
                </a>
              </li>
              <li>
                <a
                  href={APP_CONFIG.GITHUB_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-white transition-colors text-sm"
                >
                  GitHub
                </a>
              </li>
              <li>
                <span className="text-gray-400 text-sm">
                  버전 {APP_CONFIG.VERSION}
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* 하단 구분선 및 저작권 */}
        <div className="border-t border-gray-800 mt-8 pt-8">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <p className="text-sm text-gray-400">
              © {currentYear} {APP_CONFIG.AUTHOR}. 개인 학습 및 개발 목적으로 제작되었습니다.
            </p>
            <div className="flex space-x-6 mt-4 md:mt-0">
              <span className="text-xs text-gray-500">
                Made with ❤️ by bnbong
              </span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
